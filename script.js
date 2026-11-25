const menuButton = document.getElementById("menuButton");
const navigation = document.getElementById("navigation");

menuButton.addEventListener("click", function () {
  navigation.classList.toggle("open");
});
document.querySelectorAll("#navigation a").forEach(function (link) {
  link.addEventListener("click", function () {
    navigation.classList.remove("open");
  });
});

document.getElementById("exampleButton").addEventListener("click", function () {
  document.getElementById("objective").value = "3, 5";
  document.getElementById("constraints").value = "2, 1 <= 8\n1, 2 <= 8";
  document.getElementById("result").innerHTML =
    "<h3>Solution</h3><p class='muted'>Example loaded. Click Solve Problem to calculate it.</p>";
});

// Simple primal simplex solver for: Maximize c*x, A*x <= b, x >= 0, b >= 0.
function solveSimplex(c, constraints) {
  const variableCount = c.length;
  const constraintCount = constraints.length;
  const totalColumns = variableCount + constraintCount;
  const tableau = [];

  constraints.forEach(function (constraint, rowIndex) {
    const row = new Array(totalColumns + 1).fill(0);
    for (let j = 0; j < variableCount; j++) row[j] = constraint.coefficients[j];
    row[variableCount + rowIndex] = 1;
    row[totalColumns] = constraint.rhs;
    tableau.push(row);
  });

  const objectiveRow = new Array(totalColumns + 1).fill(0);
  for (let j = 0; j < variableCount; j++) objectiveRow[j] = -c[j];
  tableau.push(objectiveRow);

  const basis = [];
  for (let i = 0; i < constraintCount; i++) basis.push(variableCount + i);
  const snapshots = [];
  const maxIterations = 100;

  function saveSnapshot() {
    snapshots.push(tableau.map(row => row.slice()));
  }
  saveSnapshot();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const zRow = tableau[constraintCount];
    let pivotColumn = -1;
    let mostNegative = -1e-9;

    for (let j = 0; j < totalColumns; j++) {
      if (zRow[j] < mostNegative) {
        mostNegative = zRow[j];
        pivotColumn = j;
      }
    }

    if (pivotColumn === -1) {
      const values = new Array(variableCount).fill(0);
      basis.forEach(function (basicColumn, rowIndex) {
        if (basicColumn < variableCount) values[basicColumn] = tableau[rowIndex][totalColumns];
      });
      return {
        status: "optimal",
        values: values,
        objective: tableau[constraintCount][totalColumns],
        snapshots: snapshots,
        basis: basis.slice(),
        variableCount: variableCount,
        constraintCount: constraintCount
      };
    }

    let pivotRow = -1;
    let smallestRatio = Infinity;
    for (let i = 0; i < constraintCount; i++) {
      const pivotValue = tableau[i][pivotColumn];
      if (pivotValue > 1e-9) {
        const ratio = tableau[i][totalColumns] / pivotValue;
        if (ratio >= -1e-9 && ratio < smallestRatio) {
          smallestRatio = ratio;
          pivotRow = i;
        }
      }
    }

    if (pivotRow === -1) return { status: "unbounded" };

    const pivotValue = tableau[pivotRow][pivotColumn];
    for (let j = 0; j <= totalColumns; j++) tableau[pivotRow][j] /= pivotValue;

    for (let i = 0; i <= constraintCount; i++) {
      if (i === pivotRow) continue;
      const factor = tableau[i][pivotColumn];
      for (let j = 0; j <= totalColumns; j++) {
        tableau[i][j] -= factor * tableau[pivotRow][j];
      }
    }

    basis[pivotRow] = pivotColumn;
    saveSnapshot();
  }

  return { status: "limit" };
}

function formatNumber(value) {
  if (Math.abs(value) < 1e-8) value = 0;
  return Number(value.toFixed(4)).toString();
}

function renderTableau(tableau, index, variableCount, constraintCount, basis) {
  const headers = ["BV"];
  for (let j = 0; j < variableCount; j++) headers.push("x" + (j + 1));
  for (let j = 0; j < constraintCount; j++) headers.push("s" + (j + 1));
  headers.push("RHS");

  let html = "<div class='iteration'><h4>Tableau " + (index + 1) + "</h4><table><thead><tr>";
  headers.forEach(h => html += "<th>" + h + "</th>");
  html += "</tr></thead><tbody>";

  tableau.forEach(function (row, rowIndex) {
    const label = rowIndex === constraintCount ? "Z" :
      (basis[rowIndex] < variableCount ? "x" + (basis[rowIndex] + 1) : "s" + (basis[rowIndex] - variableCount + 1));
    html += "<tr><th>" + label + "</th>";
    row.forEach(value => html += "<td>" + formatNumber(value) + "</td>");
    html += "</tr>";
  });
  html += "</tbody></table></div>";
  return html;
}

document.getElementById("solveButton").addEventListener("click", function () {
  const result = document.getElementById("result");
  const objectiveText = document.getElementById("objective").value.trim();
  const constraintText = document.getElementById("constraints").value.trim();

  try {
    const c = objectiveText.split(",").map(v => Number(v.trim()));
    if (!c.length || c.some(v => !Number.isFinite(v)) || c.some(v => v < 0)) {
      throw new Error("Enter valid non-negative objective coefficients separated by commas.");
    }
    const lines = constraintText.split("\n").map(line => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Enter at least one constraint.");

    const constraints = lines.map(function (line, index) {
      if (!line.includes("<=")) {
        throw new Error("Constraint " + (index + 1) + " must use <= .");
      }
      const parts = line.split("<=");
      if (parts.length !== 2) throw new Error("Check constraint " + (index + 1) + ".");
      const coefficients = parts[0].split(",").map(v => Number(v.trim()));
      const rhs = Number(parts[1].trim());
      if (coefficients.length !== c.length || coefficients.some(v => !Number.isFinite(v)) ||
          !Number.isFinite(rhs) || rhs < 0) {
        throw new Error("Constraint " + (index + 1) + " has invalid values or the wrong number of coefficients.");
      }
      return { coefficients: coefficients, rhs: rhs };
    });

    const solution = solveSimplex(c, constraints);
    if (solution.status === "unbounded") {
      result.innerHTML = "<h3>Result</h3><p>This problem appears to be unbounded. Check the constraints.</p>";
      return;
    }
    if (solution.status !== "optimal") {
      result.innerHTML = "<h3>Result</h3><p>The iteration limit was reached. Please check the problem.</p>";
      return;
    }

    let html = "<h3>Optimal Solution</h3><div class='result-summary'>";
    solution.values.forEach((value, i) => {
      html += "<div><strong>x" + (i + 1) + "</strong> = " + formatNumber(value) + "</div>";
    });
    html += "<div><strong>Maximum Z</strong> = " + formatNumber(solution.objective) + "</div></div>";
    html += "<p class='muted'>Simplex tableau iterations:</p>";

    solution.snapshots.forEach(function (tableau, index) {
      // Basis labels for each saved tableau are reconstructed from the current
      // basis only for the final tableau; earlier tables use a generic row label.
      const basisForTable = index === solution.snapshots.length - 1
        ? solution.basis
        : Array.from({length: solution.constraintCount}, (_, i) => solution.variableCount + i);
      html += renderTableau(tableau, index, solution.variableCount, solution.constraintCount, basisForTable);
    });
    result.innerHTML = html;
  } catch (error) {
    result.innerHTML = "<h3>Please check your input</h3><p>" + error.message + "</p>";
  }
});

// Feedback is displayed in this browser session only; no server is connected.
document.getElementById("feedbackForm").addEventListener("submit", function (event) {
  event.preventDefault();
  const name = document.getElementById("feedbackName").value.trim();
  const rating = document.getElementById("feedbackRating").value;
  const message = document.getElementById("feedbackMessage").value.trim();
  document.getElementById("feedbackOutput").textContent =
    "Thank you, " + name + "! Your " + rating + " rating and feedback have been added for this session.";
  this.reset();
});
