# PyFCM golden fixtures

`../fixtures/pyfcm-golden.json` holds scenario results computed by PyFCM's own math
(`pyfcm_scenario.py`, copied from [PyFCM](https://github.com/payamaminpour/PyFCM) by Payam Aminpour, MIT).
`test/inference.test.js` checks `runInference` against it.

The JSON is generated and committed. Tests never run Python. To regenerate (needs `numpy` and `openpyxl`):

    python3 test/golden/generate_golden.py <path to PyFCM's Adjacency_Matrix_Example.xlsx>

Cases that PyFCM does not settle within 10,000 steps are left out. PyFCM has no cap (it can run forever
on a map that never settles), `runInference` stops at 10,000 and returns the mean of the last two
states, so the two are meant to differ there. A map that settles slowly can need more: modified Kosko
with tanh on the example map at noise threshold 0.5 takes about 21,000 steps in PyFCM.
