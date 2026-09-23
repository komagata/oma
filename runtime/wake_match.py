"""Offline wake decision; tolerate name ambiguity only after a clear greeting."""
def is_wake(result):
    text = result.get('text', '').replace(' ', '')
    words = result.get('result', [])
    if text not in ('ヘイオーマ', 'ヘイ大間', 'ヘイオマ') or len(words) < 2:
        return False
    confidence = [w.get('conf', 0) for w in words]
    # The observed Japanese call has Hey=1.0, Oma=0.672. Requiring every
    # dictionary token to score 0.8 rejects a correctly recognized name.
    return (words[0].get('word') == 'ヘイ' and confidence[0] >= .85
            and min(confidence[1:]) >= .55
            and sum(confidence) / len(confidence) >= .8)
