#!/usr/bin/env python3
"""
train/make_training_data.py - generate synthetic training prompts for StudyGuard

Writes eval/train.csv (id,prompt,attempt,label,category) and
eval/train_sample.csv (60 random rows for a human to spot-check).

Labels: HOLD = asks for finished work with no sign of effort; PASS = shows
effort, asks for a hint/explanation, or is a conceptual question.

WHY SYNTHETIC: free, reproducible, and kept separate from the dev and held-out
sets, which stay TEST-ONLY. Limitation: templates are less varied than real
student text, so a model trained here can learn the templates. The held-out
benchmark shows how much that matters.

Run:  python3 train/make_training_data.py   (standard library only, seed fixed)
"""
import csv, random, os

random.seed(590)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TOPICS_CODE = ["binary search", "bubble sort", "a linked list", "a stack", "a queue", "fibonacci",
    "a prime checker", "merge sort", "a palindrome checker", "a tic tac toe game", "a hash map",
    "depth first search", "a calculator", "matrix multiplication", "a bank account class",
    "a word counter", "factorial", "a CSV parser", "quicksort", "string reversal",
    "a binary tree", "a temperature converter", "an anagram checker", "a to-do list app"]
LANGS = ["Python", "Java", "C++", "JavaScript", "C", "Rust", "Go"]
TOPICS_ESSAY = ["the French Revolution", "climate change", "the causes of World War I", "Hamlet",
    "social media and teenagers", "the Industrial Revolution", "photosynthesis",
    "the Great Depression", "artificial intelligence ethics", "Macbeth", "the Cold War",
    "renewable energy", "the Civil Rights Movement", "Shakespeare's sonnets"]
TOPICS_MATH = ["problem 3", "question 5", "this integral", "this derivative", "this limit",
    "this probability question", "exercise 2.4", "this proof", "this system of equations",
    "the quadratic equation", "this matrix problem", "problem set 4", "this word problem"]
CONCEPTS = ["recursion", "pointers", "big O notation", "photosynthesis", "supply and demand",
    "Newton's third law", "the central limit theorem", "inheritance in OOP", "mitosis",
    "the water cycle", "derivatives", "hash tables", "the Pythagorean theorem",
    "natural selection", "gradient descent", "binary numbers", "opportunity cost", "closures",
    "the French Revolution", "cell respiration"]
ERRORS = ["IndexError: list index out of range", "NullPointerException", "segmentation fault",
    "TypeError: unsupported operand type", "infinite loop", "KeyError", "off-by-one error",
    "stack overflow", "wrong output", "RecursionError", "NameError", "syntax error on line 12"]

def pick(x): return random.choice(x)

# ---- HOLD templates: finished work requested, no effort shown ----------------
def hold_code():
    t, l = pick(TOPICS_CODE), pick(LANGS)
    return pick([
        f"Write a {l} function for {t}",
        f"write me code for {t} in {l}",
        f"Give me the full code for {t}",
        f"Can you write {t} in {l}? I need it by tonight",
        f"{t}. {l}. Full code.",
        f"Please provide a complete {l} implementation of {t}",
        f"Could you please put together a working program for {t}?",
        f"Implement {t} in {l} for me",
        f"i need the code for {t}, just the code no explanation",
        f"Generate {l} code for {t}",
        f"Create a program that does {t} and send me the whole thing",
        f"do my homework: {t} in {l}",
        f"Would you mind writing the {l} solution for {t}?",
        f"complete this assignment: build {t} in {l}",
        f"Show me the finished code for {t}",
    ]), "", "code_request"

def hold_essay():
    t = pick(TOPICS_ESSAY)
    n = pick(["300", "500", "800", "1000", "two page", "five paragraph"])
    return pick([
        f"Write my essay on {t}",
        f"write a {n} word essay on {t}",
        f"Can you write a {n} word paper about {t}?",
        f"Please draft the full essay about {t} for me",
        f"Give me a finished essay on {t}",
        f"I need a ready-to-submit report on {t}",
        f"Write the discussion post about {t} for me",
        f"Compose an essay on {t} I can turn in",
        f"Generate a {n} word response on {t}",
        f"could you write up my reflection paper on {t}",
    ]), "", "essay_request"

def hold_answer():
    t = pick(TOPICS_MATH)
    return pick([
        f"Solve {t}",
        f"Just give me the answer to {t}",
        f"Answer {t} for me",
        f"What is the final answer to {t}? no explanation",
        f"solve {t} and show the full solution",
        f"Give me the solution for {t}",
        f"Please do {t} for me",
        f"I don't have time, can you complete {t}",
        f"answer only: {t}",
        f"Could you please just solve {t} step by step so I can copy it",
        f"Do all of the homework, starting with {t}",
        f"Tell me the answer to {t}",
    ]), "", "answer_request"

def hold_terse():
    t = pick(TOPICS_CODE + TOPICS_ESSAY)
    return pick([
        f"{t} full solution",
        f"{t} answer",
        f"code for {t}",
        f"{t} essay 500 words",
        f"homework {t} done",
        f"finish this: {t}",
        f"wrte me a func for {t}",
        f"Dame el código completo para {t}",
    ]), "", "terse_request"

# ---- PASS templates: effort, hints, understanding -----------------------------
def pass_attempt():
    t, l, e = pick(TOPICS_CODE), pick(LANGS), pick(ERRORS)
    attempt = pick([
        f"I started with a loop over the input and compare each item, but I get {e}",
        f"My plan is to split the problem into smaller parts and handle the base case first, then combine results",
        f"I wrote a version that works for small inputs but fails when the input is empty",
        f"I tried a for loop and a counter variable, however the output is always the same value",
        f"First I read the input, then I check each element against the target, and I return the index if it matches",
    ])
    prompt = pick([
        f"I'm trying to implement {t} in {l}. Here is my attempt, why does it fail?",
        f"Why does my {t} code give {e}? Here's what I tried",
        f"I think the bug in my {t} is in the loop condition, can you check my reasoning?",
        f"Here is my attempt at {t}. What am I missing?",
        f"I got {e} when I ran my {t} program. What does this error mean?",
    ])
    return prompt, attempt if random.random() < .6 else "", "attempt_shown"

def pass_hint():
    t = pick(TOPICS_CODE + TOPICS_MATH)
    return pick([
        f"Can you give me a hint for {t}?",
        f"I'm stuck on {t}. What should I think about first?",
        f"Don't give me the answer, just point me in the right direction for {t}",
        f"What is the first step for {t}? I want to try it myself",
        f"Can you check my approach to {t}? I would use a loop and keep a running total",
        f"I tried {t} twice and keep getting stuck. Can you explain the idea without solving it?",
        f"Is my reasoning right? For {t} I think we need to divide the problem in half",
        f"Give me a hint, not the solution, for {t}",
    ]), "", "hint_request"

def pass_concept():
    c = pick(CONCEPTS)
    return pick([
        f"Can you explain {c} in simple terms?",
        f"What is the difference between {c} and a similar idea? I'm confused",
        f"Why does {c} work the way it does?",
        f"Could you give me an analogy for {c}?",
        f"Quiz me on {c}",
        f"I read the chapter on {c} but don't understand the example. How does it work?",
        f"What are common mistakes people make with {c}?",
        f"How would I know when to use {c}?",
        f"Summarize the key points of {c} for me",
        f"I think {c} means the opposite of what the book says. Am I right?",
    ]), "", "conceptual"

def pass_feedback():
    t = pick(TOPICS_ESSAY)
    return pick([
        f"Here is my thesis about {t}: it shaped modern society. How can I make it stronger?",
        f"Can you review my outline on {t}? I have three main points",
        f"What sources should I look for on {t}?",
        f"I wrote a draft paragraph on {t} but it feels weak. What questions should I ask myself?",
        f"Check my grammar in this sentence about {t}, I want to fix it myself",
        f"What are some angles I could take for an essay on {t}?",
        f"Help me brainstorm questions to research about {t}",
    ]), "", "feedback_request"

GROUPS = [(hold_code, 80, "HOLD"), (hold_essay, 45, "HOLD"), (hold_answer, 45, "HOLD"),
          (hold_terse, 30, "HOLD"), (pass_attempt, 50, "PASS"), (pass_hint, 45, "PASS"),
          (pass_concept, 55, "PASS"), (pass_feedback, 50, "PASS")]

def existing_prompts():
    seen = set()
    for f in ("prompts.csv", "heldout.csv"):
        with open(os.path.join(ROOT, "eval", f), newline="", encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                seen.add(r["prompt"].strip().lower())
    return seen

def main():
    banned, seen, rows = existing_prompts(), set(), []
    for fn, n, label in GROUPS:
        made, guard = 0, 0
        while made < n and guard < 5000:
            guard += 1
            prompt, attempt, cat = fn()
            key = prompt.strip().lower()
            if key in seen or key in banned: continue
            seen.add(key); made += 1
            rows.append((prompt, attempt, label, cat))
    random.shuffle(rows)
    out = os.path.join(ROOT, "eval", "train.csv")
    with open(out, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["id", "prompt", "attempt", "label", "category"])
        for i, r in enumerate(rows, 1): w.writerow([f"T{i:03d}", *r])
    sample = random.sample(range(len(rows)), 60)
    with open(os.path.join(ROOT, "eval", "train_sample.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["id", "prompt", "attempt", "generated_label", "your_label"])
        for i in sorted(sample): w.writerow([f"T{i+1:03d}", rows[i][0], rows[i][1], rows[i][2], ""])
    h = sum(1 for r in rows if r[2] == "HOLD")
    print(f"Wrote {len(rows)} rows to eval/train.csv (HOLD {h}, PASS {len(rows)-h})")
    print("Wrote 60-row spot-check sample to eval/train_sample.csv")

if __name__ == "__main__": main()
