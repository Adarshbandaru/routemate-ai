#!/usr/bin/env python3
"""Export RouteMate AI research paper into a publication-ready academic HTML pre-print.

Inlines Markdown content, MathJax equation rendering, vector SVG figures,
and BibTeX citation data into a standalone, styled academic document.
"""
import html
import os
import re
from pathlib import Path

PAPER_DIR = Path(__file__).resolve().parent
REPO_ROOT = PAPER_DIR.parent.parent


def markdown_to_html_snippet(text: str) -> str:
    """Basic lightweight conversion of markdown headings, bold, and code blocks for pre-print."""
    out = []
    in_code = False
    in_math_block = False

    lines = text.split("\n")
    for line in lines:
        if line.startswith("```"):
            in_code = not in_code
            out.append("<pre><code>" if in_code else "</code></pre>")
            continue

        if in_code:
            out.append(html.escape(line))
            continue

        if line.startswith("$$") and line.endswith("$$") and len(line) > 2:
            out.append(f"<div class='math-display'>{line}</div>")
            continue

        if line.startswith("# "):
            out.append(f"<h1>{html.escape(line[2:])}</h1>")
        elif line.startswith("## "):
            out.append(f"<h2>{html.escape(line[3:])}</h2>")
        elif line.startswith("### "):
            out.append(f"<h3>{html.escape(line[4:])}</h3>")
        elif line.startswith("#### "):
            out.append(f"<h4>{html.escape(line[5:])}</h4>")
        elif line.startswith("- "):
            out.append(f"<li>{line[2:]}</li>")
        elif re.match(r"^\d+\.\s", line):
            content = re.sub(r"^\d+\.\s", "", line)
            out.append(f"<li>{content}</li>")
        elif line.strip() == "---":
            out.append("<hr/>")
        elif line.strip() == "":
            out.append("<p></p>")
        else:
            # Inline bold and math formatting
            formatted = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", line)
            formatted = re.sub(r"\*(.+?)\*", r"<em>\1</em>", formatted)
            formatted = re.sub(r"`(.+?)`", r"<code>\1</code>", formatted)
            out.append(f"<p>{formatted}</p>")

    return "\n".join(out)


def build_academic_preprint():
    paper_md_path = PAPER_DIR / "paper.md"
    bib_path = PAPER_DIR / "citation.bib"
    output_html_path = PAPER_DIR / "preprint.html"

    if not paper_md_path.exists():
        raise FileNotFoundError(f"Missing {paper_md_path}")

    paper_text = paper_md_path.read_text(encoding="utf-8")
    bib_text = bib_path.read_text(encoding="utf-8") if bib_path.exists() else ""

    body_html = markdown_to_html_snippet(paper_text)

    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RouteMate AI — Research Preprint</title>
  <!-- MathJax for publication-grade mathematical equations -->
  <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
  <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
  <style>
    body {{
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #111827;
      background-color: #f9fafb;
      margin: 0;
      padding: 40px 20px;
    }}
    .preprint-container {{
      max-width: 900px;
      margin: 0 auto;
      background: #ffffff;
      padding: 60px 80px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      border-radius: 4px;
    }}
    h1 {{
      font-size: 22pt;
      font-weight: 700;
      text-align: center;
      margin-bottom: 8px;
      line-height: 1.25;
    }}
    h2 {{
      font-size: 14pt;
      font-weight: 700;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 4px;
      margin-top: 32px;
      margin-bottom: 12px;
      color: #1f2937;
    }}
    h3 {{
      font-size: 12pt;
      font-weight: 700;
      margin-top: 20px;
      margin-bottom: 8px;
      color: #374151;
    }}
    p {{
      text-align: justify;
      margin-bottom: 12px;
    }}
    li {{
      margin-bottom: 6px;
    }}
    .math-display {{
      margin: 16px 0;
      text-align: center;
    }}
    pre {{
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: 'Courier New', Courier, monospace;
      font-size: 9.5pt;
    }}
    code {{
      font-family: 'Courier New', Courier, monospace;
      font-size: 10pt;
      background: #f3f4f6;
      padding: 1px 4px;
      border-radius: 2px;
    }}
    .citation-box {{
      background: #f8fafc;
      border-left: 4px solid #3b82f6;
      padding: 16px;
      margin-top: 32px;
      border-radius: 0 4px 4px 0;
    }}
    .citation-box h4 {{
      margin: 0 0 8px 0;
      font-family: sans-serif;
      font-size: 10pt;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    @media print {{
      body {{ background: none; padding: 0; }}
      .preprint-container {{ box-shadow: none; padding: 0; max-width: 100%; }}
    }}
  </style>
</head>
<body>
  <div class="preprint-container">
    {body_html}

    <div class="citation-box">
      <h4>BibTeX Citation</h4>
      <pre><code>{html.escape(bib_text)}</code></pre>
    </div>
  </div>
</body>
</html>
"""
    output_html_path.write_text(html_template, encoding="utf-8")
    print(f"Pre-print generated successfully at: {output_html_path}")
    return output_html_path


if __name__ == "__main__":
    build_academic_preprint()
