import type { ImportedFile } from "./files";
export const demoFiles: ImportedFile[] = [
  {
    path: "main.tex",
    data: Buffer.from(String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb,graphicx,booktabs,xcolor}
\usepackage[colorlinks=true,linkcolor=black,citecolor=black]{hyperref}
\definecolor{forest}{HTML}{316653}
\title{Small Ideas,\\[4pt] \textcolor{forest}{Beautifully Expressed}}
\author{A workspace for your next discovery}
\date{October 2026}

\begin{document}
\maketitle
\begin{abstract}
Every paper begins with a question. This small project is a place to
think clearly, work through an equation, and turn a promising idea into
something you can share. Your files stay on your computer; your choice
of AI assistant is always yours.
\end{abstract}

\section{Start with a question}
What happens when we make a little room for uncertainty? A good model
does not eliminate it. Instead, it gives us a language for reasoning
about what we know, and what we still need to learn.

\input{sections/method}

\section{Make it your own}
Edit this source and press \texttt{Cmd+Enter} to compile. Try selecting
a paragraph and asking the assistant to make it clearer. Review Edits
lets you compare every change; Manual Type writes at your cursor.

\begin{table}[h]
\centering
\begin{tabular}{lrr}
\toprule
Observation & Before & After \\
\midrule
Clarity & 0.64 & 0.89 \\
Precision & 0.71 & 0.93 \\
\bottomrule
\end{tabular}
\caption{Illustrative values for a fictional experiment.}
\end{table}

\section{A note on evidence}
These examples are intentionally synthetic. Replace them with your
own measurements, cite your sources, and keep the details that make
your work reproducible~\cite{knuth1984}.
\bibliographystyle{plain}
\bibliography{references}
\end{document}
`),
  },
  {
    path: "sections/method.tex",
    data: Buffer.from(String.raw`\section{A simple model}
Consider observations $x_1,\ldots,x_n$ and their sample mean:
\begin{equation}
  \bar{x} = \frac{1}{n}\sum_{i=1}^{n} x_i.
  \label{eq:mean}
\end{equation}
The simplicity of Equation~\ref{eq:mean} is part of its usefulness.
Before introducing complexity, we can ask what this baseline explains
and where it falls short.
`),
  },
  {
    path: "references.bib",
    data: Buffer.from(
      "@book{knuth1984,\n  author = {Donald E. Knuth},\n  title = {The TeXbook},\n  year = {1984},\n  publisher = {Addison-Wesley}\n}\n",
    ),
  },
  {
    path: "README.md",
    data: Buffer.from(
      "# Welcome to Prism\n\nThis is a synthetic demonstration project. Main document: main.tex. Engine: pdfLaTeX. Bibliography: BibTeX.\n\nAdd an API key in Settings to use your chosen assistant.\n",
    ),
  },
];
