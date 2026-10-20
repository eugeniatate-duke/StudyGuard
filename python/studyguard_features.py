"""
python/studyguard_features.py - the feature pipeline shared with model.js

Python and JavaScript must turn text into exactly the same features, or a model
trained in Python would give different answers in the browser. This file is the
Python twin of tokenize()/featureTokens() in model.js. tests/parity.test.js
checks that the two agree to 1e-9 on saved cases.
"""
import re

_WORD = re.compile(r"[a-z0-9à-ÿ']+")


def tokenize(text):
    """Lowercase words; curly quotes become straight so "don't" stays one word."""
    text = (text or "").lower().replace("‘", "'").replace("’", "'")
    return _WORD.findall(text)


def feature_tokens(prompt, attempt=""):
    """Words + two-word phrases from the prompt; attempt-box words get an "a_" prefix."""
    words = tokenize(prompt)
    out = list(words)
    out += [words[i] + " " + words[i + 1] for i in range(len(words) - 1)]
    att = tokenize(attempt)
    if len(att) >= 5:
        out.append("a_present")
    out += ["a_" + w for w in att]
    return out


SEP = "\x1f"  # joins prompt and attempt into one string for scikit-learn


def pack(prompt, attempt=""):
    return (prompt or "") + SEP + (attempt or "")


def analyzer(doc):
    """scikit-learn analyzer: packed 'prompt<SEP>attempt' string -> feature tokens."""
    prompt, _, attempt = doc.partition(SEP)
    return feature_tokens(prompt, attempt)
