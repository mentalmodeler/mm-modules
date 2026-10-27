# PyFCM golden fixtures

`../fixtures/pyfcm-golden.json` holds scenario results computed by PyFCM's own math
(`pyfcm_scenario.py`, copied from [PyFCM](https://github.com/payamaminpour/PyFCM) by Payam Aminpour, MIT).
`test/inference.test.js` checks `runInference` against it.

The JSON is generated and committed. Tests never run Python. To regenerate (needs `numpy` and `openpyxl`):

    python3 test/golden/generate_golden.py <path to PyFCM's Adjacency_Matrix_Example.xlsx>
