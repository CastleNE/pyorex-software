"""
Restricted formula evaluator for calculated columns (DATA screen "Add calculated
column" tool). Two execution modes share ONE validation pass so preview and the
full-dataset commit can never disagree on what is accepted:

1. `evaluate_preview` — runs the formula row-by-row over a small sample via
   `asteval.Interpreter` (declared in pyproject.toml as the project's expression
   evaluator, previously unused anywhere in the codebase).
2. `apply_formula_to_dataframe` — translates the SAME validated AST into a
   vectorized `pl.Expr` for the full dataset (fast, no Python-level row loop).

Security: formulas are parsed with `ast.parse(mode="eval")`, which already makes
statements (imports, assignments, loops, function defs) syntactically
impossible. On top of that, `_validate` walks the tree and rejects anything
that isn't in an explicit node/name/function whitelist — in particular NO
attribute access at all (blocks `().__class__.__bases__`-style sandbox escapes)
and NO calls except to the whitelisted function names.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass, field

import polars as pl
from asteval import Interpreter

ALLOWED_FUNCS = {"log10", "sqrt", "abs", "log", "exp"}
IF_FUNC = "IF"

_ALLOWED_NODE_TYPES = (
    ast.Expression,
    ast.BinOp, ast.UnaryOp, ast.BoolOp, ast.Compare, ast.Call, ast.Name,
    ast.Constant, ast.IfExp, ast.Load,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Mod, ast.Pow, ast.FloorDiv,
    ast.USub, ast.UAdd, ast.Not,
    ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
)


class FormulaError(ValueError):
    pass


@dataclass
class ParsedFormula:
    tree: ast.Expression
    column_refs: set[str] = field(default_factory=set)


def parse_and_validate(formula: str, extra_allowed_funcs: frozenset[str] = frozenset()) -> ParsedFormula:
    """Parse + whitelist-validate a formula. Raises FormulaError on anything unsafe.

    `extra_allowed_funcs` is an additive, backward-compatible whitelist extension
    for callers that need domain-specific functions beyond ALLOWED_FUNCS (e.g.
    analysis/spectrometry/spectral_formula.py's REFLECTANCE/DEPTH) — it does not
    change validation for callers that pass nothing (the default DATA-screen
    calculated-column behavior is unchanged)."""
    if not formula or not formula.strip():
        raise FormulaError("Formula is empty")
    try:
        tree = ast.parse(formula, mode="eval")
    except SyntaxError as exc:
        raise FormulaError(f"Invalid syntax: {exc.msg}") from exc

    column_refs: set[str] = set()
    all_funcs = ALLOWED_FUNCS | extra_allowed_funcs

    for node in ast.walk(tree):
        if not isinstance(node, _ALLOWED_NODE_TYPES):
            raise FormulaError(f"Expression not allowed: {type(node).__name__}")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise FormulaError("Only direct function calls are allowed (no attribute calls)")
            fname = node.func.id
            if fname != IF_FUNC and fname not in all_funcs:
                raise FormulaError(f"Function not allowed: {fname}")
            if fname == IF_FUNC and len(node.args) != 3:
                raise FormulaError("IF(condition, value_if_true, value_if_false) requires 3 arguments")
            if node.keywords:
                raise FormulaError("Keyword arguments are not allowed")
        if isinstance(node, ast.Name):
            name = node.id
            if name in all_funcs or name == IF_FUNC:
                continue
            if name.startswith("__"):
                raise FormulaError("Dunder names are not allowed")
            column_refs.add(name)

    return ParsedFormula(tree=tree, column_refs=column_refs)


def _make_interpreter() -> Interpreter:
    interp = Interpreter(minimal=True, use_numpy=False)
    interp.symtable["log10"] = __import__("math").log10
    interp.symtable["sqrt"] = __import__("math").sqrt
    interp.symtable["abs"] = abs
    interp.symtable["log"] = __import__("math").log
    interp.symtable["exp"] = __import__("math").exp
    interp.symtable[IF_FUNC] = lambda cond, a, b: a if cond else b
    return interp


def evaluate_preview(formula: str, df: pl.DataFrame, variables: list[str], sample_size: int = 20) -> dict:
    """Row-by-row preview over a small sample. Returns values/errors + an inferred dtype."""
    parsed = parse_and_validate(formula)
    missing = parsed.column_refs - set(df.columns)
    if missing:
        raise FormulaError(f"Unknown column(s) referenced: {', '.join(sorted(missing))}")

    sample = df.head(sample_size)
    interp = _make_interpreter()
    values: list[float | str | bool | None] = []
    errors: list[str | None] = []

    for row in sample.to_dicts():
        for col in parsed.column_refs:
            interp.symtable[col] = row.get(col)
        interp.error = []
        result = interp(formula)
        if interp.error:
            values.append(None)
            errors.append(str(interp.error[0].get_error()))
        else:
            values.append(result)
            errors.append(None)

    numeric_values = [v for v in values if isinstance(v, (int, float)) and v is not None]
    inferred_dtype = "numeric" if numeric_values and len(numeric_values) == len([v for v in values if v is not None]) else (
        "text" if any(isinstance(v, str) for v in values) else "numeric"
    )

    return {
        "values": values,
        "errors": errors,
        "inferred_dtype": inferred_dtype,
        "n_sampled": len(values),
        "n_errors": sum(1 for e in errors if e is not None),
    }


def _translate_to_expr(node: ast.AST) -> pl.Expr:
    if isinstance(node, ast.Expression):
        return _translate_to_expr(node.body)
    if isinstance(node, ast.Constant):
        return pl.lit(node.value)
    if isinstance(node, ast.Name):
        return pl.col(node.id)
    if isinstance(node, ast.UnaryOp):
        operand = _translate_to_expr(node.operand)
        if isinstance(node.op, ast.USub):
            return -operand
        if isinstance(node.op, ast.UAdd):
            return operand
        if isinstance(node.op, ast.Not):
            return ~operand
        raise FormulaError(f"Unary operator not allowed: {type(node.op).__name__}")
    if isinstance(node, ast.BinOp):
        left = _translate_to_expr(node.left)
        right = _translate_to_expr(node.right)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.FloorDiv):
            return left // right
        if isinstance(node.op, ast.Mod):
            return left % right
        if isinstance(node.op, ast.Pow):
            return left**right
        raise FormulaError(f"Operator not allowed: {type(node.op).__name__}")
    if isinstance(node, ast.BoolOp):
        exprs = [_translate_to_expr(v) for v in node.values]
        combined = exprs[0]
        for e in exprs[1:]:
            combined = (combined & e) if isinstance(node.op, ast.And) else (combined | e)
        return combined
    if isinstance(node, ast.Compare):
        if len(node.ops) != 1 or len(node.comparators) != 1:
            raise FormulaError("Chained comparisons are not supported")
        left = _translate_to_expr(node.left)
        right = _translate_to_expr(node.comparators[0])
        op = node.ops[0]
        if isinstance(op, ast.Eq):
            return left == right
        if isinstance(op, ast.NotEq):
            return left != right
        if isinstance(op, ast.Lt):
            return left < right
        if isinstance(op, ast.LtE):
            return left <= right
        if isinstance(op, ast.Gt):
            return left > right
        if isinstance(op, ast.GtE):
            return left >= right
        raise FormulaError(f"Comparison not allowed: {type(op).__name__}")
    if isinstance(node, ast.IfExp):
        cond = _translate_to_expr(node.test)
        return pl.when(cond).then(_translate_to_expr(node.body)).otherwise(_translate_to_expr(node.orelse))
    if isinstance(node, ast.Call):
        fname = node.func.id  # type: ignore[union-attr]
        if fname == IF_FUNC:
            cond = _translate_to_expr(node.args[0])
            then_ = _translate_to_expr(node.args[1])
            else_ = _translate_to_expr(node.args[2])
            return pl.when(cond).then(then_).otherwise(else_)
        arg = _translate_to_expr(node.args[0])
        if fname == "log10":
            return arg.log10()
        if fname == "sqrt":
            return arg.sqrt()
        if fname == "abs":
            return arg.abs()
        if fname == "log":
            return arg.log()
        if fname == "exp":
            return arg.exp()
        raise FormulaError(f"Function not allowed: {fname}")
    raise FormulaError(f"Expression not allowed: {type(node).__name__}")


def apply_formula_to_dataframe(formula: str, df: pl.DataFrame) -> pl.Series:
    """Vectorized full-dataset evaluation. Raises FormulaError on the same
    conditions `evaluate_preview`/`parse_and_validate` would reject."""
    parsed = parse_and_validate(formula)
    missing = parsed.column_refs - set(df.columns)
    if missing:
        raise FormulaError(f"Unknown column(s) referenced: {', '.join(sorted(missing))}")
    expr = _translate_to_expr(parsed.tree)
    return df.select(expr.alias("_calculated")).to_series()
