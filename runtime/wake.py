"""Offline wake phrase recognition. Never emits transcripts or writes audio."""
import json, sys
from wake_match import is_wake
from vosk import Model, KaldiRecognizer, SetLogLevel
SetLogLevel(-1)
model = Model(sys.argv[1])
# O.M.A. is not in the Japanese dictionary; these words provide its sounds.
recognizer = KaldiRecognizer(model, 16000, json.dumps(['ヘイ オー マ', 'ヘイ 大間', 'ヘイ オマ', '[unk]'], ensure_ascii=False))
recognizer.SetWords(True)
print('{"ready":true}', flush=True)
while chunk := sys.stdin.buffer.read(3200):
    if recognizer.AcceptWaveform(chunk):
        result = json.loads(recognizer.Result())
        if is_wake(result):
            print('{"wake":true}', flush=True)
            recognizer.Reset()
