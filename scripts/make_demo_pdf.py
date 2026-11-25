"""生成仓库自带的示例课件（原创内容，无版权问题）：examples 用的 Supply & Demand 小课件。

    python scripts/make_demo_pdf.py demo.pdf
"""
import sys

import fitz  # PyMuPDF

W, H = 960, 540
TEAL = (0.05, 0.36, 0.44)
INK = (0.12, 0.11, 0.09)
MUTED = (0.45, 0.43, 0.40)
SAND = (0.98, 0.94, 0.81)


def page(doc, title, kicker=None):
    p = doc.new_page(width=W, height=H)
    p.draw_rect(fitz.Rect(0, 0, W, H), color=None, fill=(1, 1, 1))
    p.draw_rect(fitz.Rect(0, 0, 14, H), color=None, fill=TEAL)
    if kicker:
        p.insert_text((60, 62), kicker.upper(), fontname="hebo", fontsize=13, color=TEAL)
    p.insert_textbox(fitz.Rect(60, 72, W - 60, 170), title, fontname="hebo", fontsize=34, color=INK)
    p.insert_text((60, H - 26), "Lecta · demo deck · Principles of Microeconomics", fontname="helv", fontsize=10, color=MUTED)
    return p


def bullets(p, items, top=180, size=21):
    y = top
    for it in items:
        sub = it.startswith("-")
        text = it.lstrip("- ")
        x = 96 if sub else 72
        p.draw_circle((x - 14, y - 7), 3.2 if not sub else 2.4, color=None, fill=TEAL if not sub else MUTED)
        rect = fitz.Rect(x, y - size, W - 70, y + 3 * size)
        used = p.insert_textbox(rect, text, fontname="helv", fontsize=size - (3 if sub else 0), color=INK if not sub else MUTED)
        lines = max(1, int((3 * size + size - used) // (size * 1.18)) if used >= 0 else 1)
        y += int(size * 1.2 * lines + size * 0.75)


def main(out):
    doc = fitz.open()

    p = doc.new_page(width=W, height=H)
    p.draw_rect(fitz.Rect(0, 0, W, H), color=None, fill=TEAL)
    p.draw_rect(fitz.Rect(60, 300, 200, 306), color=None, fill=(0.95, 0.82, 0.48))
    p.insert_text((60, 210), "Supply and Demand", fontname="hebo", fontsize=54, color=(1, 1, 1))
    p.insert_text((60, 270), "How markets find a price", fontname="helv", fontsize=26, color=(0.86, 0.92, 0.93))
    p.insert_text((60, 350), "Principles of Microeconomics · Lecture 3", fontname="helv", fontsize=16, color=(0.86, 0.92, 0.93))

    p = page(doc, "The Law of Demand", "Demand")
    bullets(p, [
        "Ceteris paribus, when the price of a good rises, the quantity demanded falls.",
        "Two reasons behind the downward-sloping demand curve:",
        "- Substitution effect: buyers switch to relatively cheaper alternatives.",
        "- Income effect: a higher price reduces purchasing power.",
        "A change in price causes a movement along the curve, not a shift of the curve.",
    ])

    p = page(doc, "What Shifts the Demand Curve?", "Demand")
    bullets(p, [
        "Income: demand for normal goods rises with income; demand for inferior goods falls.",
        "Prices of related goods: substitutes and complements.",
        "Tastes and preferences, expectations, and the number of buyers.",
        "Any of these factors shifts the entire curve to the left or right.",
    ])

    p = page(doc, "Market Equilibrium", "Equilibrium")
    ox, oy, sx, sy = 120, 470, 330, 270
    p.draw_line((ox, oy), (ox + sx, oy), color=INK, width=1.6)
    p.draw_line((ox, oy), (ox, oy - sy), color=INK, width=1.6)
    p.insert_text((ox + sx - 60, oy + 22), "Quantity", fontname="helv", fontsize=14, color=MUTED)
    p.insert_text((ox - 58, oy - sy + 10), "Price", fontname="helv", fontsize=14, color=MUTED)
    p.draw_line((ox + 20, oy - sy + 20), (ox + sx - 20, oy - 20), color=TEAL, width=3)
    p.draw_line((ox + 20, oy - 20), (ox + sx - 20, oy - sy + 20), color=(0.85, 0.55, 0.15), width=3)
    ex, ey = ox + sx / 2, oy - sy / 2
    p.draw_line((ox, ey), (ex, ey), color=MUTED, width=1, dashes="[4] 0")
    p.draw_line((ex, oy), (ex, ey), color=MUTED, width=1, dashes="[4] 0")
    p.draw_circle((ex, ey), 5, color=None, fill=INK)
    p.insert_text((ox + sx - 18, oy - 22), "D", fontname="hebo", fontsize=18, color=TEAL)
    p.insert_text((ox + sx - 18, oy - sy + 22), "S", fontname="hebo", fontsize=18, color=(0.85, 0.55, 0.15))
    p.insert_text((ox - 30, ey + 5), "P*", fontname="hebo", fontsize=15, color=INK)
    p.insert_text((ex - 8, oy + 22), "Q*", fontname="hebo", fontsize=15, color=INK)
    p.draw_rect(fitz.Rect(520, 200, 900, 440), color=None, fill=SAND)
    p.insert_textbox(fitz.Rect(544, 222, 880, 430),
                     "Equilibrium is where quantity supplied equals quantity demanded.\n\n"
                     "Above P*: a surplus pushes the price down.\nBelow P*: a shortage pushes the price up.",
                     fontname="helv", fontsize=17, color=INK)

    p = page(doc, "Price Elasticity of Demand", "Elasticity")
    bullets(p, [
        "Measures how responsive quantity demanded is to a change in price.",
        "Elasticity = % change in quantity demanded / % change in price.",
        "Elastic (> 1): luxuries, goods with many substitutes.",
        "Inelastic (< 1): necessities such as insulin or petrol in the short run.",
        "Total revenue rises with a price cut only when demand is elastic.",
    ])

    doc.save(out, garbage=3, deflate=True)
    print("saved", out, doc.page_count, "pages")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "demo.pdf")
