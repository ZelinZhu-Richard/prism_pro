export interface MathSymbol {
  name: string;
  glyph: string;
  command: string;
  category: string;
  aliases?: string;
  package?: string;
}
const greek = [
  ["alpha", "α"],
  ["beta", "β"],
  ["gamma", "γ"],
  ["delta", "δ"],
  ["epsilon", "ϵ"],
  ["varepsilon", "ε"],
  ["zeta", "ζ"],
  ["eta", "η"],
  ["theta", "θ"],
  ["vartheta", "ϑ"],
  ["iota", "ι"],
  ["kappa", "κ"],
  ["lambda", "λ"],
  ["mu", "μ"],
  ["nu", "ν"],
  ["xi", "ξ"],
  ["pi", "π"],
  ["rho", "ρ"],
  ["sigma", "σ"],
  ["tau", "τ"],
  ["upsilon", "υ"],
  ["phi", "ϕ"],
  ["varphi", "φ"],
  ["chi", "χ"],
  ["psi", "ψ"],
  ["omega", "ω"],
  ["Gamma", "Γ"],
  ["Delta", "Δ"],
  ["Theta", "Θ"],
  ["Lambda", "Λ"],
  ["Xi", "Ξ"],
  ["Pi", "Π"],
  ["Sigma", "Σ"],
  ["Upsilon", "Υ"],
  ["Phi", "Φ"],
  ["Psi", "Ψ"],
  ["Omega", "Ω"],
];
export const mathSymbols: MathSymbol[] = [
  ...greek.map(([name, glyph]) => ({
    name:
      name === name.toUpperCase()
        ? `Capital ${name}`
        : name[0] === name[0].toUpperCase()
          ? `Capital ${name}`
          : name,
    glyph,
    command: "\\" + name,
    category: "Greek",
  })),
  ...[
    ["Plus or minus", "±", "pm", "plus minus"],
    ["Minus or plus", "∓", "mp", "minus plus"],
    ["Times", "×", "times", "multiply cross product"],
    ["Dot product", "·", "cdot", "multiply"],
    ["Division", "÷", "div", "divide"],
    ["Sum", "∑", "sum", "summation sigma"],
    ["Product", "∏", "prod", "product pi"],
    ["Integral", "∫", "int", "integration"],
    ["Contour integral", "∮", "oint", "integration"],
    ["Partial derivative", "∂", "partial", "differential"],
    ["Nabla", "∇", "nabla", "gradient del"],
    ["Infinity", "∞", "infty", "infinite"],
    ["Square root", "√", "sqrt{x}", "radical"],
    ["Fraction", "a/b", "frac{a}{b}", "divide ratio"],
    ["Ellipsis", "…", "ldots", "dots"],
    ["Centered dots", "⋯", "cdots", "ellipsis"],
  ].map(([name, glyph, command, aliases]) => ({
    name,
    glyph,
    command: "\\" + command,
    aliases,
    category: "Operators",
  })),
  ...[
    ["Less than or equal", "≤", "leq", "less equal"],
    ["Greater than or equal", "≥", "geq", "greater equal"],
    ["Not equal", "≠", "neq", "unequal"],
    ["Approximately equal", "≈", "approx", "approximation"],
    ["Equivalent", "≡", "equiv", "equivalence"],
    ["Similar", "∼", "sim", "similarity"],
    ["Proportional", "∝", "propto", "proportion"],
    ["Subset", "⊂", "subset", "contained"],
    ["Subset or equal", "⊆", "subseteq", "contained"],
    ["Superset", "⊃", "supset", "contains"],
    ["Superset or equal", "⊇", "supseteq", "contains"],
    ["Element of", "∈", "in", "belongs membership"],
    ["Not an element of", "∉", "notin", "membership"],
    ["Union", "∪", "cup", "set"],
    ["Intersection", "∩", "cap", "set"],
    ["Empty set", "∅", "emptyset", "null set"],
    ["For all", "∀", "forall", "universal quantifier"],
    ["Exists", "∃", "exists", "existential quantifier"],
    ["Logical and", "∧", "land", "conjunction"],
    ["Logical or", "∨", "lor", "disjunction"],
    ["Logical not", "¬", "neg", "negation"],
  ].map(([name, glyph, command, aliases]) => ({
    name,
    glyph,
    command: "\\" + command,
    aliases,
    category: "Relations and sets",
  })),
  ...[
    ["Right arrow", "→", "rightarrow", "to"],
    ["Left arrow", "←", "leftarrow", "from"],
    ["Left right arrow", "↔", "leftrightarrow", "bidirectional"],
    ["Implies", "⇒", "Rightarrow", "right double arrow implication"],
    ["Implied by", "⇐", "Leftarrow", "left double arrow"],
    ["If and only if", "⇔", "Leftrightarrow", "iff equivalent double arrow"],
    ["Maps to", "↦", "mapsto", "mapping"],
    ["Up arrow", "↑", "uparrow", "up"],
    ["Down arrow", "↓", "downarrow", "down"],
  ].map(([name, glyph, command, aliases]) => ({
    name,
    glyph,
    command: "\\" + command,
    aliases,
    category: "Arrows",
  })),
  ...[
    ["Real numbers", "ℝ", "R"],
    ["Natural numbers", "ℕ", "N"],
    ["Integers", "ℤ", "Z"],
    ["Rational numbers", "ℚ", "Q"],
    ["Complex numbers", "ℂ", "C"],
  ].map(([name, glyph, letter]) => ({
    name,
    glyph,
    command: `\\mathbb{${letter}}`,
    category: "Number sets",
    package: "amssymb",
  })),
];
export function searchSymbols(query: string, category = "All") {
  const words = query
    .toLocaleLowerCase()
    .replace(/\\/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return mathSymbols.filter(
    (s) =>
      (category === "All" || s.category === category) &&
      words.every((w) =>
        [s.name, s.command, s.glyph, s.aliases ?? ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(w),
      ),
  );
}
export function symbolSource(
  symbol: MathSymbol,
  wrap: boolean,
  nextCharacter = "",
) {
  if (wrap) return `\\(${symbol.command}\\)`;
  return (
    symbol.command +
    (/\\[A-Za-z]+$/.test(symbol.command) && /^[A-Za-z]/.test(nextCharacter)
      ? "{}"
      : "")
  );
}
