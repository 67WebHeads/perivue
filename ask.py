import os
import sys
from google import genai
from google.genai import types
from rich.console import Console
from rich.markdown import Markdown

client = genai.Client()
console = Console()

# 🛑 SAFETY FILTERS: Ignore these folders and files
IGNORE_DIRS = {'.git', 'venv', 'node_modules', '__pycache__', 'dist', 'build', 'migrations', '.idea', '.vscode'}
IGNORE_FILES = {'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'db.sqlite3'}

ALLOWED_EXT = {'.py', '.js', '.ts', '.jsx', '.tsx', '.json', '.yml', '.yaml', '.md', '.html', '.css'}
MAX_FILE_SIZE = 50 * 1024  # 50 KB limit per file

# 🧠 SYSTEM INSTRUCTION: Simpler, search-friendly code placement rules
SYSTEM_INSTRUCTION = """
You are a developer assistant. When providing code modifications for ANY file type (.py, .js, .html, etc.), you MUST be highly specific so the user can easily use 'Ctrl+F' to find where to paste the code.

Never use vague instructions like "add this to your file" or "somewhere in your component."

Always use the following format to provide a searchable reference line:

**File:** `path/to/the/file.ext`
**Action:** Add this under / Add this before / Add this near / Replace
**Reference Line to Find:**
the exact existing line of code they need to search for

**New Code:**
the new code they need to paste

If you cannot find an exact reference line to anchor your code, ask the user to provide the file contents first.
"""

def get_codebase_context():
    context = "Here is the codebase for context:\n\n"

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]

        for file in files:
            if file in IGNORE_FILES:
                continue

            if os.path.splitext(file)[1] in ALLOWED_EXT:
                filepath = os.path.join(root, file)

                # Skip files that are suspiciously huge
                try:
                    if os.path.getsize(filepath) > MAX_FILE_SIZE:
                        context += f"--- SKIPPED FILE: {filepath} (Too large) ---\n\n"
                        continue

                    with open(filepath, 'r', encoding='utf-8') as f:
                        context += f"--- BEGIN FILE: {filepath} ---\n{f.read()}\n--- END FILE ---\n\n"
                except Exception:
                    pass

    return context

def chat():
    context = get_codebase_context()
    if not sys.stdin.isatty():
        context += "Piped Input:\n" + sys.stdin.read() + "\n\n"

    user_query = " ".join(sys.argv[1:])
    if not user_query:
        console.print("[red]Please provide a prompt![/red]")
        return

    with console.status("[bold green]Reading your code and thinking...", spinner="dots"):
        response = client.models.generate_content(
            model='gemini-3.1-pro-preview',
            contents=context + "\nUser Query: " + user_query,
            # 🚀 Here is where the system instructions are passed to the model!
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION
            )
        )

    console.print("\n[bold cyan]--- Gemini 3.1 Pro ---[/bold cyan]")
    console.print(Markdown(response.text))

    if response.usage_metadata:
        in_tokens = response.usage_metadata.prompt_token_count
        out_tokens = response.usage_metadata.candidates_token_count
        total = response.usage_metadata.total_token_count
        console.print(f"\n[dim italic]📊 Tokens Used: {total:,} (Prompt: {in_tokens:,} | Output: {out_tokens:,})[/dim italic]")

    console.print()

if __name__ == "__main__":
    chat()