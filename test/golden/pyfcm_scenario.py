# Reference scenario math from PyFCM (https://github.com/payamaminpour/PyFCM), used only to
# generate test/fixtures/pyfcm-golden.json. Not part of the shipped package.
#
# TransformFunc / infer_steady / infer_scenario are copied from PyFCM's Scenario_Analysis.py
# (Payam Aminpour, Michigan State University; MIT license, see PyFCM's LICENSE.txt) with only the
# module-level globals turned into parameters. No input(), xlrd, matplotlib or networkx.
import math
import numpy as np


def TransformFunc(x, n, f_type, Lambda=1):
    if f_type == "sig":
        x_new = np.zeros(n)
        for i in range(n):
            x_new[i] = 1 / (1 + math.exp(-Lambda * x[i]))
        return x_new

    if f_type == "tanh":
        x_new = np.zeros(n)
        for i in range(n):
            x_new[i] = math.tanh(Lambda * x[i])
        return x_new

    if f_type == "biv":
        x_new = np.zeros(n)
        for i in range(n):
            if x[i] > 0:
                x_new[i] = 1
            else:
                x_new[i] = 0
        return x_new

    if f_type == "triv":
        x_new = np.zeros(n)
        for i in range(n):
            if x[i] > 0:
                x_new[i] = 1
            elif x[i] == 0:
                x_new[i] = 0
            else:
                x_new[i] = -1
        return x_new


def _step(act_vec_old, AdjmT, n, infer_rule):
    if infer_rule == "k":
        return np.matmul(AdjmT, act_vec_old)
    if infer_rule == "mk":
        return act_vec_old + np.matmul(AdjmT, act_vec_old)
    if infer_rule == "r":
        return (2 * act_vec_old - np.ones(n)) + np.matmul(AdjmT, (2 * act_vec_old - np.ones(n)))


def infer_steady(init_vec, AdjmT, n, f_type="sig", infer_rule="mk", Lambda=1):
    act_vec_old = init_vec
    resid = 1
    while resid > 0.00001:
        x = _step(act_vec_old, AdjmT, n, infer_rule)
        act_vec_new = TransformFunc(x, n, f_type, Lambda)
        resid = max(abs(act_vec_new - act_vec_old))
        act_vec_old = act_vec_new
    return act_vec_new


def infer_scenario(Scenario_concepts, change_level, init_vec, AdjmT, n,
                   f_type="sig", infer_rule="mk", Lambda=1):
    act_vec_old = init_vec
    resid = 1
    while resid > 0.00001:
        x = _step(act_vec_old, AdjmT, n, infer_rule)
        act_vec_new = TransformFunc(x, n, f_type, Lambda)
        for c in Scenario_concepts:
            act_vec_new[c] = change_level[c]
        resid = max(abs(act_vec_new - act_vec_old))
        act_vec_old = act_vec_new
    return act_vec_new


def run_scenario(matrix, names, params):
    """matrix[i][j] = influence of concept i on concept j (PyFCM adjacency layout).
    params: {noise_threshold, infer_rule, function_type, lambda, activate: {name: level}}
    Returns {"changes": {name: float}} with clamped concepts' change set to 0 (as PyFCM does)."""
    Adj_matrix = np.array(matrix, dtype=float)
    n = len(names)
    Adj_matrix[np.abs(Adj_matrix) <= params.get("noise_threshold", 0)] = 0
    activation_vec = np.ones(n)

    f_type = params.get("function_type", "sig")
    rule = params.get("infer_rule", "mk")
    lam = params.get("lambda", 1)

    change_level_by_index = {names.index(k): v for k, v in params["activate"].items()}
    scenario_concepts = [names.index(k) for k in params["activate"].keys()]

    steady = infer_steady(activation_vec, Adj_matrix.T, n, f_type, rule, lam)
    scen = infer_scenario(scenario_concepts, change_level_by_index, activation_vec,
                          Adj_matrix.T, n, f_type, rule, lam)
    change_all = scen - steady
    for c in scenario_concepts:
        change_all[c] = 0

    return {"changes": {names[i]: float(change_all[i]) for i in range(n)}}
