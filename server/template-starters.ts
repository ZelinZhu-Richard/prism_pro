import type { Engine } from "../shared/types";
import type { ImportedFile } from "./files";
import { demoFiles } from "./demo";
export interface Starter {
  id: string;
  name: string;
  description: string;
  category: string;
  root: string;
  engine: Engine;
  files: ImportedFile[];
}
const file = (path: string, text: string): ImportedFile => ({
  path,
  data: Buffer.from(text),
});
const readme = (title: string, note: string, root: string) =>
  file(
    "README.md",
    `# ${title}\n\nA generic, self-authored Leaf starter. ${note}\n\nMain document: ${root}\nCompiler: pdfLaTeX\n\nReplace all example names and text with your own work. This is not an official publisher or institution format.\n`,
  );
export const templateStarters: Starter[] = [
  {
    id: "builtin-blank",
    name: "Blank document",
    description: "A minimal article with an empty document body.",
    category: "Essentials",
    root: "main.tex",
    engine: "pdflatex",
    files: [
      file(
        "main.tex",
        "\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n",
      ),
    ],
  },
  {
    id: "builtin-example",
    name: "Example paper",
    description:
      "The existing synthetic Leaf example, with equations, a table and BibTeX references.",
    category: "Essentials",
    root: "main.tex",
    engine: "pdflatex",
    files: demoFiles,
  },
  {
    id: "builtin-article",
    name: "Research article",
    description:
      "Abstract, separate introduction and method files, equations and a replaceable BibTeX example.",
    category: "Academic",
    root: "main.tex",
    engine: "pdflatex",
    files: [
      file(
        "main.tex",
        String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath}
\usepackage[hidelinks]{hyperref}
\title{A Research Question}
\author{Your Name}
\date{\today}
\begin{document}
\maketitle
\begin{abstract}
State the question, the approach, and the principal finding. This paragraph is illustrative.
\end{abstract}
\input{sections/introduction}
\input{sections/method}
\section{Discussion}
Explain the limits of the evidence and the next question.
\bibliographystyle{plain}
\bibliography{references}
\end{document}
`,
      ),
      file(
        "sections/introduction.tex",
        String.raw`\section{Introduction}
Describe the problem and explain why it matters. Replace the synthetic reference with a real source~\cite{example2026}.
`,
      ),
      file(
        "sections/method.tex",
        String.raw`\section{Method}
For observations $x_1,\ldots,x_n$, a baseline estimate is
\begin{equation}
\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i.
\label{eq:mean}
\end{equation}
Explain the assumptions behind Equation~\ref{eq:mean}.
`,
      ),
      file(
        "references.bib",
        "@misc{example2026,\n  author = {Example Author},\n  title = {A Synthetic Reference},\n  year = {2026},\n  note = {Illustrative entry; replace before sharing}\n}\n",
      ),
      readme("Research article", "References use BibTeX.", "main.tex"),
    ],
  },
  {
    id: "builtin-report",
    name: "Technical report",
    description:
      "A title, contents, separate chapters and an appendix for a longer technical document.",
    category: "Academic",
    root: "report.tex",
    engine: "pdflatex",
    files: [
      file(
        "report.tex",
        String.raw`\documentclass[11pt]{report}
\usepackage[margin=1in]{geometry}
\usepackage[hidelinks]{hyperref}
\title{A Technical Report}
\author{Your Name}
\date{\today}
\begin{document}
\maketitle
\tableofcontents
\input{chapters/background}
\input{chapters/analysis}
\appendix
\chapter{Supporting detail}
Keep reproducibility details and supporting calculations here.
\end{document}
`,
      ),
      file(
        "chapters/background.tex",
        "\\chapter{Background}\nState the purpose, audience, and scope of this report.\n",
      ),
      file(
        "chapters/analysis.tex",
        "\\chapter{Analysis}\nExplain the method and evidence.\n\\section{Limitations}\nDescribe what the analysis cannot establish.\n",
      ),
      readme(
        "Technical report",
        "The report class provides chapters and appendices.",
        "report.tex",
      ),
    ],
  },
  {
    id: "builtin-thesis",
    name: "Thesis structure",
    description:
      "Generic book-based front matter, chapters, bibliography and appendix. Adapt it to your institution.",
    category: "Academic",
    root: "thesis.tex",
    engine: "pdflatex",
    files: [
      file(
        "thesis.tex",
        String.raw`\documentclass[12pt,oneside,openany]{book}
\usepackage[margin=1in]{geometry}
\usepackage[hidelinks]{hyperref}
\title{A Thesis Title}
\author{Your Name\\Your Institution}
\date{\today}
\begin{document}
\frontmatter
\maketitle
\chapter*{Abstract}
Summarize the question, contribution, and limitations.
\tableofcontents
\mainmatter
\input{chapters/introduction}
\input{chapters/contribution}
\appendix
\chapter{Additional material}
Include reproducibility details here.
\backmatter
\begin{thebibliography}{9}
\bibitem{synthetic} Example Author. \emph{Synthetic Reference}. 2026. Replace this illustrative entry.
\end{thebibliography}
\end{document}
`,
      ),
      file(
        "chapters/introduction.tex",
        "\\chapter{Introduction}\nDescribe the research question and context.\n",
      ),
      file(
        "chapters/contribution.tex",
        "\\chapter{Contribution}\nPresent the method and evidence. Replace the illustrative reference~\\cite{synthetic}.\n",
      ),
      readme(
        "Thesis structure",
        "Check your institution requirements before submission.",
        "thesis.tex",
      ),
    ],
  },
  {
    id: "builtin-slides",
    name: "Presentation",
    description:
      "A small Beamer presentation with title, question, method and next steps.",
    category: "Presentations",
    root: "slides.tex",
    engine: "pdflatex",
    files: [
      file(
        "slides.tex",
        String.raw`\documentclass{beamer}
\setbeamertemplate{navigation symbols}{}
\title{A Clear Research Story}
\author{Your Name}
\date{\today}
\begin{document}
\begin{frame}\titlepage\end{frame}
\begin{frame}{The question}
What do we want to understand?
\begin{itemize}
\item State one central question.
\item Explain what evidence would answer it.
\end{itemize}
\end{frame}
\begin{frame}{The approach}
\begin{equation*} \bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i \end{equation*}
Explain the assumptions behind the baseline.
\end{frame}
\begin{frame}{What comes next}
State the conclusion, one limitation, and the next step.
\end{frame}
\end{document}
`,
      ),
      readme(
        "Presentation",
        "Requires the Beamer class in your local TeX distribution.",
        "slides.tex",
      ),
    ],
  },
  {
    id: "builtin-letter",
    name: "Letter",
    description:
      "A simple letter with sender, recipient, opening and closing placeholders.",
    category: "Correspondence",
    root: "letter.tex",
    engine: "pdflatex",
    files: [
      file(
        "letter.tex",
        String.raw`\documentclass{letter}
\signature{Your Name}
\address{Your Address\\Your City}
\begin{document}
\begin{letter}{Recipient Name\\Recipient Address}
\opening{Dear Colleague,}
Introduce the purpose of your letter. Replace the placeholder sender and recipient details before sharing.
\closing{Kind regards,}
\end{letter}
\end{document}
`,
      ),
      readme(
        "Letter",
        "Replace the placeholder contact details.",
        "letter.tex",
      ),
    ],
  },
];
