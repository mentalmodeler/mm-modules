"""Writes test/fixtures/pyfcm-golden.json from PyFCM's scenario math.

Usage: python3 test/golden/generate_golden.py <path to PyFCM's Adjacency_Matrix_Example.xlsx>
Needs numpy and openpyxl. The JS tests only read the JSON; they never run Python.
"""
import datetime
import itertools
import json
import os
import sys

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pyfcm_scenario import run_scenario  # noqa: E402

RULES = {"k": "kosko", "mk": "modified kosko", "r": "rescaled kosko"}
SQUASH = {"sig": "sigmoid", "tanh": "hyperbolic tangent", "biv": "bivalent", "triv": "trivalent"}


def read_matrix(path):
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    n = ws.max_row - 1
    cell = lambda r, c: 0 if ws.cell(r + 1, c + 1).value is None else ws.cell(r + 1, c + 1).value
    names = [cell(0, j) for j in range(1, n + 1)]
    matrix = [[float(cell(i, j)) for j in range(1, n + 1)] for i in range(1, n + 1)]
    return names, matrix


def make_case(names, matrix, rule, squash, lam, noise, activate):
    params = {"noise_threshold": noise, "infer_rule": rule, "function_type": squash,
              "lambda": lam, "activate": activate}
    return {
        "settings": {"rule": RULES[rule], "squash": SQUASH[squash], "lambda": lam, "noiseThreshold": noise},
        "clamps": [{"name": k, "value": v} for k, v in activate.items()],
        "changes": run_scenario(matrix, names, params)["changes"],
    }


def main(path):
    names, matrix = read_matrix(path)
    cases = []
    activate = {names[1]: 0.5, names[4]: 1.0}
    for rule, squash, lam, noise in itertools.product(RULES, SQUASH, [1, 2.5], [0, 0.15]):
        cases.append(make_case(names, matrix, rule, squash, lam, noise, dict(activate)))
    # an explicit clamp to exactly 0 (PyFCM allows it; the old runScenario cannot express it)
    for rule in ("k", "mk"):
        cases.append(make_case(names, matrix, rule, "sig", 1, 0, {names[1]: 0.5, names[2]: 0.0}))

    out = os.path.join(HERE, "..", "fixtures", "pyfcm-golden.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w") as f:
        json.dump({
            "source": "PyFCM %s %s" % (datetime.date.today().isoformat(), os.path.basename(path)),
            "names": names, "matrix": matrix, "cases": cases,
        }, f)
    print("wrote", os.path.normpath(out), len(cases), "cases")


if __name__ == "__main__":
    main(sys.argv[1])
