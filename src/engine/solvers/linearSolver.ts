/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface LinearProblem {
  /** Number of decision variables (recipes) */
  numVars: number;
  /** M[row][var] = net production of item `row` per unit of variable `var` */
  matrix: number[][];
  /** Right-hand side demand d[row] (>= 0 for required output, 0 for intermediate balance) */
  demands: number[];
  /** Objective minimization cost per variable (>= 0) */
  varCosts: number[];
  /** Penalty cost for surplus slack s[row] (>= 0) */
  surplusPenalties: number[];
}

export interface LinearSolution {
  feasible: boolean;
  optimal: boolean;
  /** Value of each recipe variable x[j] >= 0 */
  vars: number[];
  /** Value of each surplus slack s[i] >= 0 */
  surpluses: number[];
  objectiveValue: number;
}

const EPS = 1e-9;

/**
 * Two-Phase Simplex LP solver for Factorio mass-balance equations:
 *   minimize   c^T x + w^T s
 *   subject to M x - s = d
 *              x >= 0, s >= 0
 *
 * Uses Bland's anti-cycling rule for deterministic convergence on degenerate
 * multi-product & cyclic recipe networks (Advanced Oil Cracking, Kovarex, etc.).
 */
export function solveLinearBalance(problem: LinearProblem): LinearSolution {
  const m = problem.matrix.length;
  const n = problem.numVars;

  if (m === 0 || n === 0) {
    return {
      feasible: true,
      optimal: true,
      vars: new Array(n).fill(0),
      surpluses: new Array(m).fill(0),
      objectiveValue: 0,
    };
  }

  // Variables layout:
  // [0 .. n-1]: recipe variables x_j
  // [n .. n+m-1]: surplus slack variables s_i (coeff -1 in row i)
  // [n+m .. n+2m-1]: artificial variables a_i (coeff +1 in row i)
  const totalColsPhase1 = n + 2 * m;
  const rhsCol = totalColsPhase1;

  // Tableau has (m + 1) rows; last row is Phase 1 objective row
  const tableau: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(totalColsPhase1 + 1).fill(0)
  );
  const basis: number[] = new Array(m).fill(0);

  for (let i = 0; i < m; i++) {
    let rhs = problem.demands[i];
    const sign = rhs < 0 ? -1 : 1;
    rhs = rhs * sign;

    for (let j = 0; j < n; j++) {
      tableau[i][j] = problem.matrix[i][j] * sign;
    }
    // Surplus variable s_i has coefficient -1 in M x - s = d (or +1 if row flipped)
    tableau[i][n + i] = -1 * sign;
    // Artificial variable a_i always +1
    const artCol = n + m + i;
    tableau[i][artCol] = 1;
    tableau[i][rhsCol] = rhs;
    basis[i] = artCol;
  }

  // Phase 1 objective: minimize sum(a_i)
  // Using reduced-cost row convention: z - sum(c_j x_j) = 0 -> row[j] = c_j - c_B^T A_j
  // We want to minimize W = sum(a_i), so initially c_art = 1, c_other = 0.
  // Subtract each row from objective row so artificials have reduced cost 0.
  for (let i = 0; i < m; i++) {
    for (let col = 0; col <= rhsCol; col++) {
      tableau[m][col] -= tableau[i][col];
    }
  }
  for (let i = 0; i < m; i++) {
    tableau[m][n + m + i] = 0;
  }

  runSimplex(tableau, basis, m, totalColsPhase1);

  const phase1Val = -tableau[m][rhsCol];
  if (phase1Val > 1e-6) {
    return {
      feasible: false,
      optimal: false,
      vars: new Array(n).fill(0),
      surpluses: new Array(m).fill(0),
      objectiveValue: Infinity,
    };
  }

  // Pivot out any remaining zero-valued artificial variables if possible
  for (let i = 0; i < m; i++) {
    if (basis[i] >= n + m) {
      let pivotCol = -1;
      for (let col = 0; col < n + m; col++) {
        if (Math.abs(tableau[i][col]) > 1e-7) {
          pivotCol = col;
          break;
        }
      }
      if (pivotCol !== -1) {
        pivot(tableau, basis, i, pivotCol, m, totalColsPhase1);
      }
    }
  }

  // Phase 2: build reduced tableau without artificial columns (columns 0 .. n+m-1 + rhs)
  // Keep any artificial row only if degenerate and impossible to pivot out (dropped if all zeros).
  const totalColsPhase2 = n + m;
  const tableau2: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(totalColsPhase2 + 1).fill(0)
  );
  for (let i = 0; i < m; i++) {
    for (let col = 0; col < totalColsPhase2; col++) {
      tableau2[i][col] = tableau[i][col];
    }
    tableau2[i][totalColsPhase2] = tableau[i][rhsCol];
  }

  // Set Phase 2 costs: c_j for x_j, w_i for s_i
  const costs = new Array(totalColsPhase2).fill(0);
  for (let j = 0; j < n; j++) costs[j] = problem.varCosts[j];
  for (let i = 0; i < m; i++) costs[n + i] = problem.surplusPenalties[i];

  for (let col = 0; col < totalColsPhase2; col++) {
    tableau2[m][col] = costs[col];
  }
  tableau2[m][totalColsPhase2] = 0;

  // Eliminate basic variable costs from objective row
  for (let i = 0; i < m; i++) {
    const bCol = basis[i];
    if (bCol < totalColsPhase2) {
      const cB = costs[bCol];
      if (Math.abs(cB) > EPS) {
        for (let col = 0; col <= totalColsPhase2; col++) {
          tableau2[m][col] -= cB * tableau2[i][col];
        }
      }
    }
  }

  const optimal = runSimplex(tableau2, basis, m, totalColsPhase2);

  const vars = new Array(n).fill(0);
  const surpluses = new Array(m).fill(0);
  for (let i = 0; i < m; i++) {
    const bCol = basis[i];
    const val = Math.max(0, tableau2[i][totalColsPhase2]);
    if (bCol < n) {
      vars[bCol] = val;
    } else if (bCol < n + m) {
      surpluses[bCol - n] = val;
    }
  }

  return {
    feasible: true,
    optimal,
    vars,
    surpluses,
    objectiveValue: -tableau2[m][totalColsPhase2],
  };
}

function runSimplex(
  tableau: number[][],
  basis: number[],
  m: number,
  numCols: number
): boolean {
  const maxIter = Math.max(500, (m + numCols) * 15);

  for (let iter = 0; iter < maxIter; iter++) {
    // Bland's rule: pick first column with strictly negative reduced cost
    let enterCol = -1;
    for (let col = 0; col < numCols; col++) {
      if (tableau[m][col] < -1e-8) {
        enterCol = col;
        break;
      }
    }
    if (enterCol === -1) {
      return true; // Optimal!
    }

    // Minimum ratio test with Bland tie-breaking (lowest leaving basis index)
    let leaveRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      const a = tableau[i][enterCol];
      if (a > 1e-8) {
        const ratio = Math.max(0, tableau[i][numCols]) / a;
        if (
          ratio < minRatio - 1e-10 ||
          (Math.abs(ratio - minRatio) <= 1e-10 && leaveRow !== -1 && basis[i] < basis[leaveRow])
        ) {
          minRatio = ratio;
          leaveRow = i;
        }
      }
    }

    if (leaveRow === -1) {
      return false; // Unbounded
    }

    pivot(tableau, basis, leaveRow, enterCol, m, numCols);
  }

  return false;
}

function pivot(
  tableau: number[][],
  basis: number[],
  pivotRow: number,
  pivotCol: number,
  m: number,
  numCols: number
): void {
  const pv = tableau[pivotRow][pivotCol];
  for (let col = 0; col <= numCols; col++) {
    tableau[pivotRow][col] /= pv;
  }
  for (let i = 0; i <= m; i++) {
    if (i === pivotRow) continue;
    const factor = tableau[i][pivotCol];
    if (Math.abs(factor) <= EPS) continue;
    for (let col = 0; col <= numCols; col++) {
      tableau[i][col] -= factor * tableau[pivotRow][col];
    }
    tableau[i][pivotCol] = 0;
  }
  basis[pivotRow] = pivotCol;
}
