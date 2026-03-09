"""
services/pdf_report.py
Professional Forensics PDF Report — ReportLab
Generates a multi-section PDF suitable for compliance, legal, and law enforcement use.
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, Color
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.graphics.shapes import Drawing, Line, String, Circle, Rect
from io import BytesIO
from datetime import datetime
import math

# ── Palette ───────────────────────────────────────────────────────────────────
C_BG    = HexColor("#020812")
C_PANEL = HexColor("#0b1d35")
C_CARD  = HexColor("#0e2240")
C_BORD  = HexColor("#132d50")
C_GLOW  = HexColor("#1a4070")
C_CYAN  = HexColor("#00e5ff")
C_GREEN = HexColor("#39ff14")
C_RED   = HexColor("#ff0033")
C_ORNG  = HexColor("#ff6d00")
C_GOLD  = HexColor("#ffc400")
C_PURP  = HexColor("#7c4dff")
C_TEXT  = HexColor("#b8d4f0")
C_DIM   = HexColor("#4a7099")
C_WHITE = HexColor("#ffffff")

RISK_COLOR = {"CRITICAL": C_RED, "HIGH": C_ORNG, "MEDIUM": C_GOLD, "LOW": C_GREEN}

FLAG_META = {
    "mixer_interaction":        ("Mixer Interaction",       "CRITICAL", C_RED),
    "darkweb_match":            ("Dark Web / OFAC Match",   "CRITICAL", C_RED),
    "peel_chain_detected":      ("Peel Chain",              "HIGH",     C_ORNG),
    "layered_mixer_routing":    ("Layered Mixer Routing",   "HIGH",     C_ORNG),
    "mixer_proximity":          ("Mixer Proximity",         "HIGH",     C_ORNG),
    "high_velocity":            ("High Velocity",           "MEDIUM",   C_GOLD),
    "round_amount_structuring": ("Structuring",             "MEDIUM",   C_GOLD),
    "high_fan_out":             ("High Fan-Out",            "MEDIUM",   C_GOLD),
    "high_fan_in":              ("High Fan-In",             "MEDIUM",   C_GOLD),
    "dormancy_then_activity":   ("Dormancy→Activity",       "MEDIUM",   C_GOLD),
}

FLAG_DESC = {
    "mixer_interaction":        "Direct transaction with known Tornado Cash / mixer contract confirmed.",
    "darkweb_match":            "Address matched OFAC SDN list or dark web intelligence database.",
    "peel_chain_detected":      "Funds progressively split across hops — classic obfuscation technique.",
    "layered_mixer_routing":    "Multi-hop routing through intermediate wallets before reaching mixer.",
    "mixer_proximity":          "Known mixer address found within 2 hops in transaction graph.",
    "high_velocity":            "Unusually high transaction frequency — may indicate automated activity.",
    "round_amount_structuring": "Round-value transactions consistent with AML threshold evasion.",
    "high_fan_out":             "Extremely high number of unique outgoing recipient addresses.",
    "high_fan_in":              "Extremely high number of unique incoming sender addresses.",
    "dormancy_then_activity":   "6+ month inactivity followed by sudden high-volume activity burst.",
}

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


# ── Style helpers ─────────────────────────────────────────────────────────────
def ps(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9, textColor=C_TEXT, leading=14, alignment=TA_LEFT)
    base.update(kw)
    return ParagraphStyle(name, **base)


STYLES = {
    "h1":      ps("h1", fontName="Helvetica-Bold", fontSize=22, textColor=C_CYAN, leading=26),
    "h2":      ps("h2", fontSize=9, textColor=C_DIM, alignment=TA_RIGHT),
    "section": ps("section", fontName="Helvetica-Bold", fontSize=11, textColor=C_CYAN, leading=16),
    "body":    ps("body", fontSize=9, textColor=C_TEXT, leading=14),
    "dim":     ps("dim",  fontSize=9, textColor=C_DIM,  leading=13),
    "mono":    ps("mono", fontName="Courier", fontSize=8, textColor=C_TEXT, leading=13),
    "mono_sm": ps("mono_sm", fontName="Courier", fontSize=7, textColor=C_DIM, leading=11),
    "label":   ps("label", fontName="Helvetica-Bold", fontSize=7, textColor=C_DIM, leading=10),
    "val":     ps("val",   fontName="Helvetica-Bold", fontSize=12, textColor=C_WHITE, leading=16),
    "center":  ps("center", fontSize=9, textColor=C_TEXT, alignment=TA_CENTER),
    "footer":  ps("footer", fontSize=7, textColor=C_DIM, alignment=TA_CENTER, leading=10),
    "conf":    ps("conf", fontName="Courier-Bold", fontSize=7, textColor=C_RED),
}


def divider(color=C_BORD, thick=0.5):
    return HRFlowable(width="100%", thickness=thick, color=color,
                      spaceBefore=2, spaceAfter=4)


def dark_table(rows, widths, header=False, left_accent=None):
    tbl = Table(rows, colWidths=widths)
    style = [
        ("BACKGROUND",    (0, 0), (-1, -1), C_PANEL),
        ("ROWBACKGROUNDS",(0, 0), (-1, -1), [C_PANEL, C_CARD]),
        ("TEXTCOLOR",     (0, 0), (-1, -1), C_TEXT),
        ("FONTNAME",      (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("LEFTPADDING",   (0, 0), (-1, -1), 9),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 9),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORD),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.3, C_BORD),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), C_GLOW),
            ("TEXTCOLOR",  (0, 0), (-1, 0), C_CYAN),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, 0), 8),
        ]
    if left_accent:
        style += [("LINEBEFORE", (0, 0), (0, -1), 3, left_accent)]
    tbl.setStyle(TableStyle(style))
    return tbl


def risk_gauge(score: float, label: str, size: float = 90) -> Drawing:
    """Mini SVG-style risk gauge for PDF."""
    d = Drawing(size, size)
    cx, cy, r = size / 2, size / 2, size * 0.36
    col = RISK_COLOR.get(label, C_CYAN)

    # Background arc
    d.add(Circle(cx, cy, r, fillColor=None, strokeColor=C_BORD, strokeWidth=7))

    # Progress ticks
    segs   = 48
    filled = int(segs * score / 100)
    for i in range(segs):
        angle = math.radians(-90 + i * (360 / segs))
        r1    = r - 5
        r2    = r + 2
        d.add(Line(
            cx + r1 * math.cos(angle), cy + r1 * math.sin(angle),
            cx + r2 * math.cos(angle), cy + r2 * math.sin(angle),
            strokeColor=col if i < filled else C_BORD,
            strokeWidth=2.8,
        ))

    # Score text
    d.add(String(cx, cy + 5, f"{score:.0f}",
        fontName="Helvetica-Bold", fontSize=int(size * 0.23),
        textAnchor="middle", fillColor=col))
    d.add(String(cx, cy - 11, "/ 100",
        fontName="Helvetica", fontSize=int(size * 0.08),
        textAnchor="middle", fillColor=C_DIM))
    d.add(String(cx, cy - 22, label,
        fontName="Helvetica-Bold", fontSize=int(size * 0.08),
        textAnchor="middle", fillColor=col))
    return d


# ── Main report builder ───────────────────────────────────────────────────────
def generate_pdf_report(data: dict) -> BytesIO:
    """
    Build and return a PDF forensics report as a BytesIO buffer.

    Required keys in `data`:
        id, address, chain, risk_score, risk_label,
        total_txns, total_volume, flags, darkweb_hits,
        risk_factors, ai_summary, graph (dict with 'stats'),
        created_at
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
        title="MKChain Forensics Report",
        author="MKChain Intelligence Platform",
    )

    # ── Unpack ────────────────────────────────────────────────────────────────
    addr         = data.get("address", "—")
    chain        = data.get("chain", "eth").upper()
    score        = float(data.get("risk_score", 0))
    label        = data.get("risk_label", "LOW")
    total_txns   = data.get("total_txns", 0)
    total_vol    = float(data.get("total_volume", 0))
    flags        = data.get("flags", [])
    dw_hits      = data.get("darkweb_hits", [])
    risk_factors = data.get("risk_factors", [])
    ai_summary   = data.get("ai_summary", "")
    gstats       = data.get("graph", {}).get("stats", {})
    created_at   = str(data.get("created_at", datetime.utcnow().isoformat()))[:19]
    risk_col     = RISK_COLOR.get(label, C_CYAN)
    analysis_id  = data.get("id", "—")

    story = []

    # ════════════════════════════════════════════════════════════════════════
    # HEADER
    # ════════════════════════════════════════════════════════════════════════
    hdr_tbl = Table([[
        Paragraph("MKCHAIN", STYLES["h1"]),
        Paragraph("BLOCKCHAIN FORENSICS INTELLIGENCE REPORT", STYLES["h2"]),
    ]], colWidths=[CONTENT_W * 0.42, CONTENT_W * 0.58])
    hdr_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_BG),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_CYAN),
        ("LINEBELOW",     (0, 0), (-1, 0),  2,   C_CYAN),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 4))

    # Meta bar
    meta_tbl = Table([[
        Paragraph(f"REPORT ID: #{analysis_id}", STYLES["mono_sm"]),
        Paragraph(f"GENERATED: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", STYLES["mono_sm"]),
        Paragraph("CLASSIFICATION: CONFIDENTIAL", STYLES["conf"]),
    ]], colWidths=[CONTENT_W / 3] * 3)
    meta_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), HexColor("#050f1e")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("BOX",           (0, 0), (-1, -1), 0.3, C_BORD),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 14))

    # ── Helper to add a section heading ──────────────────────────────────────
    def section(num, title):
        story.append(KeepTogether([
            Paragraph(f"{num} — {title}", STYLES["section"]),
            divider(C_CYAN, 1),
            Spacer(1, 4),
        ]))

    # ════════════════════════════════════════════════════════════════════════
    # 01  SUBJECT WALLET
    # ════════════════════════════════════════════════════════════════════════
    section("01", "SUBJECT WALLET")
    story.append(dark_table([
        [Paragraph("ADDRESS",        STYLES["label"]),
         Paragraph(addr, ps("addr", fontName="Courier-Bold", fontSize=9, textColor=C_WHITE))],
        [Paragraph("BLOCKCHAIN",     STYLES["label"]),
         Paragraph(chain, STYLES["val"])],
        [Paragraph("ANALYSIS DATE",  STYLES["label"]),
         Paragraph(created_at.replace("T", " "), STYLES["mono"])],
        [Paragraph("ANALYSIS ID",    STYLES["label"]),
         Paragraph(f"#{analysis_id}", STYLES["mono"])],
    ], [CONTENT_W * 0.22, CONTENT_W * 0.78]))
    story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # 02  RISK ASSESSMENT (gauge + stats side-by-side)
    # ════════════════════════════════════════════════════════════════════════
    section("02", "RISK ASSESSMENT")

    # Left: gauge card
    gauge_drw = risk_gauge(score, label, size=100)
    gauge_inner = Table(
        [[gauge_drw], [Paragraph(f"{label} RISK",
            ps("rl", fontName="Helvetica-Bold", fontSize=10,
               textColor=risk_col, alignment=TA_CENTER))]],
        colWidths=[CONTENT_W * 0.26],
    )
    gauge_inner.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_PANEL),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("BOX",           (0, 0), (-1, -1), 1, risk_col),
    ]))

    # Right: stats table
    mixer_cnt = gstats.get("mixer_nodes", 0)
    stats_rows = [
        [Paragraph("METRIC",             STYLES["label"]),
         Paragraph("VALUE",              STYLES["label"])],
        [Paragraph("Risk Score",         STYLES["body"]),
         Paragraph(f"{score:.1f} / 100", ps("sv", fontName="Helvetica-Bold", fontSize=10, textColor=risk_col))],
        [Paragraph("Total Transactions", STYLES["body"]),
         Paragraph(f"{total_txns:,}",    STYLES["mono"])],
        [Paragraph(f"Volume ({chain})",  STYLES["body"]),
         Paragraph(f"{total_vol:.6f}",   STYLES["mono"])],
        [Paragraph("Graph Nodes",        STYLES["body"]),
         Paragraph(str(gstats.get("total_nodes", "—")), STYLES["mono"])],
        [Paragraph("Graph Edges",        STYLES["body"]),
         Paragraph(str(gstats.get("total_edges", "—")), STYLES["mono"])],
        [Paragraph("Mixer Nodes",        STYLES["body"]),
         Paragraph(str(mixer_cnt),
            ps("mv", fontName="Courier-Bold", fontSize=8,
               textColor=C_RED if mixer_cnt > 0 else C_TEXT))],
        [Paragraph("Max Hop Depth",      STYLES["body"]),
         Paragraph(str(gstats.get("max_hops", "—")), STYLES["mono"])],
        [Paragraph("Graph Density",      STYLES["body"]),
         Paragraph(str(gstats.get("density", "—")), STYLES["mono"])],
    ]
    stats_tbl = dark_table(stats_rows, [CONTENT_W * 0.46, CONTENT_W * 0.24], header=True)

    combo = Table([[gauge_inner, Spacer(6, 1), stats_tbl]],
                  colWidths=[CONTENT_W * 0.28, 6, CONTENT_W * 0.72])
    combo.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(combo)
    story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # 03  AI FORENSICS SUMMARY
    # ════════════════════════════════════════════════════════════════════════
    if ai_summary:
        section("03", "AI FORENSICS SUMMARY")
        summ_tbl = Table(
            [[Paragraph(ai_summary, STYLES["body"])]],
            colWidths=[CONTENT_W],
        )
        summ_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_PANEL),
            ("LEFTPADDING",   (0, 0), (-1, -1), 14),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 14),
            ("TOPPADDING",    (0, 0), (-1, -1), 12),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
            ("BOX",           (0, 0), (-1, -1), 0.5, C_BORD),
            ("LINEBEFORE",    (0, 0), (0,  -1), 3,   C_CYAN),
        ]))
        story.append(summ_tbl)
        story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # 04  RISK FLAGS
    # ════════════════════════════════════════════════════════════════════════
    section("04", "RISK FLAGS DETECTED")
    if flags:
        flag_rows = [[
            Paragraph("FLAG",        STYLES["label"]),
            Paragraph("IMPACT",      STYLES["label"]),
            Paragraph("DESCRIPTION", STYLES["label"]),
        ]]
        for f in flags:
            display, impact_str, impact_col = FLAG_META.get(
                f, (f.replace("_", " ").upper(), "MEDIUM", C_GOLD)
            )
            flag_rows.append([
                Paragraph(display, ps("fl", fontName="Helvetica-Bold", fontSize=8, textColor=C_WHITE)),
                Paragraph(impact_str, ps("fi", fontName="Helvetica-Bold", fontSize=7, textColor=impact_col)),
                Paragraph(FLAG_DESC.get(f, "—"), STYLES["dim"]),
            ])
        story.append(dark_table(flag_rows,
            [CONTENT_W * 0.27, CONTENT_W * 0.12, CONTENT_W * 0.61], header=True))
    else:
        story.append(Paragraph("✓  No risk flags detected. Wallet behaviour appears normal.", STYLES["body"]))
    story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # 05  DARK WEB / OFAC MATCHES
    # ════════════════════════════════════════════════════════════════════════
    section("05", "DARK WEB / OFAC MATCHES")
    if dw_hits:
        dw_rows = [[
            Paragraph("ADDRESS",       STYLES["label"]),
            Paragraph("ENTITY",        STYLES["label"]),
            Paragraph("CATEGORY",      STYLES["label"]),
            Paragraph("SOURCE",        STYLES["label"]),
        ]]
        for h in dw_hits:
            a = h.get("address", "")
            dw_rows.append([
                Paragraph(a[:18] + "…" if len(a) > 18 else a, STYLES["mono_sm"]),
                Paragraph(h.get("label", "—"),
                    ps("dw_e", fontName="Helvetica-Bold", fontSize=8, textColor=C_RED)),
                Paragraph(h.get("category", "—").replace("_", " ").upper(),
                    ps("dw_c", fontName="Courier", fontSize=7, textColor=C_ORNG)),
                Paragraph(h.get("source", "—"), STYLES["mono_sm"]),
            ])
        story.append(dark_table(dw_rows,
            [CONTENT_W * 0.30, CONTENT_W * 0.32, CONTENT_W * 0.20, CONTENT_W * 0.18],
            header=True))
    else:
        story.append(Paragraph("✓  No OFAC sanctions or dark web address matches found.", STYLES["body"]))
    story.append(Spacer(1, 14))

    # ════════════════════════════════════════════════════════════════════════
    # 06  CONTRIBUTING RISK FACTORS
    # ════════════════════════════════════════════════════════════════════════
    if risk_factors:
        section("06", "CONTRIBUTING RISK FACTORS")
        for i, factor in enumerate(risk_factors):
            impact     = factor.get("impact", "MEDIUM")
            imp_col    = {"CRITICAL": C_RED, "HIGH": C_ORNG, "MEDIUM": C_GOLD, "LOW": C_GREEN}.get(impact, C_GOLD)
            factor_tbl = Table([
                [Paragraph(factor.get("factor", "—"),
                    ps("fn", fontName="Helvetica-Bold", fontSize=9, textColor=C_WHITE)),
                 Paragraph(f"[{impact}]",
                    ps("fi2", fontName="Helvetica-Bold", fontSize=8, textColor=imp_col, alignment=TA_RIGHT))],
                [Paragraph(factor.get("detail", ""), STYLES["dim"]),
                 Paragraph("", STYLES["dim"])],
            ], colWidths=[CONTENT_W * 0.78, CONTENT_W * 0.22])
            factor_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), C_PANEL),
                ("LEFTPADDING",   (0, 0), (-1, -1), 10),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
                ("TOPPADDING",    (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("BOX",           (0, 0), (-1, -1), 0.3, C_BORD),
                ("LINEBEFORE",    (0, 0), (0,  -1), 3, imp_col),
                ("SPAN",          (0, 1), (1,  1)),
            ]))
            story.append(factor_tbl)
            story.append(Spacer(1, 4))
        story.append(Spacer(1, 10))

    # ════════════════════════════════════════════════════════════════════════
    # 07  TRANSACTION NETWORK SUMMARY
    # ════════════════════════════════════════════════════════════════════════
    section("07", "TRANSACTION NETWORK SUMMARY")
    net_rows = [[
        Paragraph("METRIC",     STYLES["label"]),
        Paragraph("VALUE",      STYLES["label"]),
        Paragraph("ASSESSMENT", STYLES["label"]),
    ]]
    density  = float(gstats.get("density", 0))
    net_data = [
        ("Total Nodes",    str(gstats.get("total_nodes", "—")),
         "Normal" if int(gstats.get("total_nodes", 0)) < 50 else "Large network — review advised"),
        ("Total Edges",    str(gstats.get("total_edges", "—")), "—"),
        ("Mixer Nodes",    str(mixer_cnt),
         "⚠ SUSPICIOUS — mixer interaction confirmed" if mixer_cnt > 0 else "✓ No mixers detected"),
        ("Exchange Nodes", str(gstats.get("exchange_nodes", 0)), "Known exchange activity"),
        ("Max Hop Depth",  str(gstats.get("max_hops", "—")), f"{gstats.get('max_hops','?')}-hop trace completed"),
        ("Graph Density",  f"{density:.4f}",
         "Sparse (expected)" if density < 0.1 else "Dense topology (unusual)"),
    ]
    for lbl, val, assess in net_data:
        warn = "⚠" in assess or "SUSPICIOUS" in assess
        net_rows.append([
            Paragraph(lbl, STYLES["body"]),
            Paragraph(val, ps("nv", fontName="Courier-Bold", fontSize=8,
                              textColor=C_RED if warn else C_WHITE)),
            Paragraph(assess, ps("na", fontSize=8,
                                 textColor=C_RED if warn else C_DIM)),
        ])
    story.append(dark_table(net_rows,
        [CONTENT_W * 0.36, CONTENT_W * 0.18, CONTENT_W * 0.46], header=True))
    story.append(Spacer(1, 18))

    # ════════════════════════════════════════════════════════════════════════
    # FOOTER
    # ════════════════════════════════════════════════════════════════════════
    story.append(divider(C_BORD))
    story.append(Paragraph(
        f"Generated by MKChain Blockchain Forensics Intelligence Platform · "
        f"Report #{analysis_id} · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} · "
        f"For investigative use only. This report does not constitute legal advice.",
        STYLES["footer"],
    ))

    doc.build(story)
    buf.seek(0)
    return buf
