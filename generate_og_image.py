import os
from PIL import Image, ImageDraw, ImageFont

def generate_og():
    width = 1200
    height = 630
    
    # 1. Base dark background (#080c18)
    img = Image.new("RGB", (width, height), (8, 12, 24))
    draw = ImageDraw.Draw(img)
    
    # 2. Subtle grid lines
    grid_size = 48
    grid_color = (18, 26, 46)
    for x in range(0, width, grid_size):
        draw.line([(x, 0), (x, height)], fill=grid_color, width=1)
    for y in range(0, height, grid_size):
        draw.line([(0, y), (width, y)], fill=grid_color, width=1)
        
    # 3. Fonts
    font_dir = os.path.join(os.environ.get("WINDIR", "C:\\Windows"), "Fonts")
    bold_path = os.path.join(font_dir, "arialbd.ttf")
    reg_path = os.path.join(font_dir, "arial.ttf")
    
    font_badge = ImageFont.truetype(bold_path, 15)
    font_name = ImageFont.truetype(bold_path, 64)
    font_sub = ImageFont.truetype(bold_path, 23)
    font_desc = ImageFont.truetype(reg_path, 19)
    font_tag = ImageFont.truetype(bold_path, 14)
    font_mono = ImageFont.truetype(bold_path, 14)

    margin_x = 72
    y = 56

    # 4. Top Row: Role Badge
    badge_label = "●  FULL-STACK & AGENTIC AI SYSTEMS ENGINEER"
    bbox = font_badge.getbbox(badge_label)
    bw = bbox[2] - bbox[0] + 36
    draw.rounded_rectangle([margin_x, y, margin_x + bw, y + 38], radius=19, fill=(18, 30, 22), outline=(204, 255, 0), width=1)
    draw.text((margin_x + 18, y + 10), badge_label, fill=(204, 255, 0), font=font_badge)

    # Top Right Status Pill
    status_label = "⚡ 100% TEST COVERAGE • ZERO TRUST ISOLATION"
    bbox_s = font_badge.getbbox(status_label)
    sw = bbox_s[2] - bbox_s[0] + 32
    draw.rounded_rectangle([width - margin_x - sw, y, width - margin_x, y + 38], radius=8, fill=(16, 32, 28), outline=(52, 211, 153), width=1)
    draw.text((width - margin_x - sw + 16, y + 10), status_label, fill=(52, 211, 153), font=font_badge)

    # 5. Author Name
    y += 74
    draw.text((margin_x, y), "Ahmed Musthaffa", fill=(255, 255, 255), font=font_name)

    # 6. Subtitle / Core Specialization
    y += 84
    draw.text((margin_x, y), "LangGraph Multi-Tool Agents  •  Databricks Unity Catalog  •  High-Scale Systems", fill=(96, 165, 250), font=font_sub)

    # 7. Description Paragraph
    y += 44
    desc_lines = [
        "Production portfolio featuring enterprise Model Context Protocol (MCP) tool servers,",
        "Databricks Unity Catalog 3-tier clearance, sub-5ms SHA-256 caching, and 60 req/min microservices."
    ]
    for line in desc_lines:
        draw.text((margin_x, y), line, fill=(203, 213, 225), font=font_desc)
        y += 28

    # 8. Tech Stack Tags
    y += 26
    tags = [
        ("LangGraph Cyclical Routing", "accent"),
        ("Model Context Protocol (MCP)", "blue"),
        ("Databricks Unity Catalog RBAC", "blue"),
        ("FastAPI & Python", "neutral"),
        ("Sub-300ms Hybrid RAG", "neutral"),
        ("Redis SHA-256 Cache", "neutral"),
        ("60 req/min Rate Limiting", "neutral"),
        ("AWS Cloud", "neutral"),
        ("0% Privilege Escalation", "accent")
    ]
    
    tag_x = margin_x
    tag_y = y
    for tag_name, tag_type in tags:
        bbox = font_tag.getbbox(tag_name)
        text_w = bbox[2] - bbox[0]
        padding_x = 16
        box_w = text_w + padding_x * 2
        box_h = 36

        if tag_x + box_w > width - margin_x:
            tag_x = margin_x
            tag_y += 48

        if tag_type == "accent":
            fill_c = (20, 32, 20)
            border_c = (204, 255, 0)
            text_c = (204, 255, 0)
        elif tag_type == "blue":
            fill_c = (18, 30, 48)
            border_c = (96, 165, 250)
            text_c = (147, 197, 253)
        else:
            fill_c = (22, 30, 45)
            border_c = (71, 85, 105)
            text_c = (241, 245, 249)

        draw.rounded_rectangle([tag_x, tag_y, tag_x + box_w, tag_y + box_h], radius=8, fill=fill_c, outline=border_c, width=1)
        draw.text((tag_x + padding_x, tag_y + 9), tag_name, fill=text_c, font=font_tag)
        tag_x += box_w + 12

    # 9. Bottom Footer Divider & Text
    footer_y = height - 64
    draw.line([(margin_x, footer_y), (width - margin_x, footer_y)], fill=(51, 65, 85), width=1)
    draw.text((margin_x, footer_y + 18), "https://ahmed-portfolio-kohl.vercel.app", fill=(204, 255, 0), font=font_mono)
    draw.text((width - margin_x - 470, footer_y + 18), "ahmedmusthaffa02@gmail.com  •  GitHub: @Ahmedmusthaffa", fill=(148, 163, 184), font=font_mono)

    os.makedirs("assets", exist_ok=True)
    out_path = os.path.join("assets", "og-image.png")
    img.save(out_path, format="PNG", optimize=True)
    print(f"Generated Crisp High-Res OG Image at {out_path} ({os.path.getsize(out_path)} bytes)")

if __name__ == "__main__":
    generate_og()
