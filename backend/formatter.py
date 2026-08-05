import re

# Common conversational greetings and phrases that should NEVER be turned into section headers with colons
GREETING_PHRASES = {
    'hello', 'hello!', 'hi', 'hi!', 'hey', 'hey!', 'greetings', 'greetings!',
    'sure', 'sure!', 'thanks', 'thanks!', 'thank you', 'thank you!',
    'how can i help', 'how can i assist', 'how can i help you today',
    'how can i assist you today'
}

def is_conversational_line(text: str) -> bool:
    """Checks if a string is a simple greeting or conversational sentence."""
    clean = re.sub(r'[\*\#!?\.,]', '', text).strip().lower()
    if clean in GREETING_PHRASES or clean.startswith('hello') or clean.startswith('hi ') or clean.startswith('hey '):
        return True
    return False

def convert_markdown_tables(text: str) -> str:
    """
    Parses Markdown tables (| col1 | col2 |) and converts them into
    clean key-value bullet points for mobile/messaging apps.
    """
    lines = text.splitlines()
    new_lines = []
    in_table = False
    headers = []
    
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|") and len(stripped) > 2:
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            
            if all(re.match(r'^:?-+:?$', c) for c in cells):
                continue
                
            if not in_table:
                headers = [re.sub(r'\*+', '', h).strip() for h in cells]
                in_table = True
            else:
                clean_cells = [re.sub(r'^\*+|\*+$', '', c).strip() for c in cells]
                if headers and len(clean_cells) == len(headers):
                    items = [f"{h}: {c}" for h, c in zip(headers, clean_cells) if c]
                    row_str = "• " + ", ".join(items)
                    new_lines.append(row_str)
                elif clean_cells:
                    new_lines.append("• " + " | ".join(clean_cells))
        else:
            if in_table:
                in_table = False
                headers = []
                new_lines.append("")
            new_lines.append(line)
            
    return "\n".join(new_lines)

def clean_headers(text: str) -> str:
    """
    Cleans up raw markdown headers like `### Header Name` or `### **Header Name:**`.
    Preserves simple greetings (like "Hello!") as plain natural text without adding colons.
    """
    lines = text.splitlines()
    cleaned_lines = []
    in_code_block = False
    
    for line in lines:
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            cleaned_lines.append(line)
            continue
            
        if in_code_block:
            cleaned_lines.append(line)
            continue
            
        stripped = line.strip()
        
        # Check if line is a hash header e.g. ### Title
        is_hash_header = re.match(r'^\s*#{1,6}\s*(.*)$', line)
        # Check if line is standalone bold header e.g. **Topic Title:**
        is_standalone_bold_header = re.match(r'^\s*\*\*(.*?)\*\*:?\s*$', line)
        
        if is_hash_header:
            raw_title = is_hash_header.group(1)
            title = re.sub(r'^\*+|\*+$', '', raw_title).strip()
            if is_conversational_line(title):
                cleaned_lines.append(title)
            else:
                title_clean = title.rstrip(':')
                cleaned_lines.append(f"\n{title_clean}:")
        elif is_standalone_bold_header:
            title = is_standalone_bold_header.group(1).strip()
            if is_conversational_line(title):
                cleaned_lines.append(title)
            else:
                title_clean = title.rstrip(':')
                cleaned_lines.append(f"\n{title_clean}:")
        else:
            cleaned_lines.append(line)
            
    return "\n".join(cleaned_lines)

def clean_greetings_and_bullets(text: str) -> str:
    """
    Normalizes short responses and greetings:
    If response starts with a greeting line followed by a single bullet point like "- How can I assist...",
    converts it to natural text ("Hello! How can I assist you today?").
    """
    lines = [l for l in text.splitlines() if l.strip()]
    
    if len(lines) <= 3:
        # Check if first line is greeting and second line is bulleted question
        if len(lines) >= 1 and is_conversational_line(lines[0]):
            clean_first = lines[0].rstrip(':').strip()
            if len(lines) >= 2 and re.match(r'^\s*[\-\•\*\d+\.]\s*', lines[1]):
                bullet_text = re.sub(r'^\s*[\-\•\*\d+\.]\s*', '', lines[1]).strip()
                return f"{clean_first} {bullet_text}"
                
    return text

def strip_all_double_asterisks(text: str) -> str:
    """
    Strips out all ** double asterisks from text except inside code blocks.
    """
    lines = text.splitlines()
    result = []
    in_code_block = False
    
    for line in lines:
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            result.append(line)
            continue
            
        if in_code_block:
            result.append(line)
        else:
            result.append(line.replace("**", ""))
            
    return "\n".join(result)

def format_ai_response(text: str, channel: str = "webchat") -> str:
    """
    Main entry point to format AI output based on target channel.
    Supported channels: 'whatsapp', 'telegram', 'webchat' / default
    """
    if not text:
        return ""
        
    text_with_tables = convert_markdown_tables(text)
    cleaned = clean_headers(text_with_tables)
    cleaned = clean_greetings_and_bullets(cleaned)
    formatted = strip_all_double_asterisks(cleaned)
    
    return re.sub(r'\n{3,}', '\n\n', formatted).strip()
