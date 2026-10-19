#!/bin/sh
# rebuild-words.sh: build wordlists from open source dictionaries.
#
# Generates TWO wordlists, directly in their tool subdirectories:
#   1. crosswords/words.js: Full dictionary (words_alpha.txt + WordNet) for
#      crosswords and fill-ins. More words = denser puzzles.
#   2. wordle/words.js: Curated common words (google-10000-english +
#      words_alpha.txt) for Wordle. Only words people know.
#
# If output files exist, prompts before overwriting.
# POSIX shell + curl + tar only.

set -e
OUT_FULL="crosswords/words.js"
OUT_WORDLE="wordle/words.js"
SUPP_URL="https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
WN_URL="https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz"
# Common words for Wordle: google-10000-english (10k most frequent words,
# open source, widely used). Answers come from here; guesses from words_alpha.
GOOGLE10K_URL="https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt"
TMPDIR="${TMPDIR:-/tmp}/rebuild-words-$$"
mkdir -p "$TMPDIR"
trap 'rm -rf "$TMPDIR"' EXIT INT TERM

confirm_overwrite() {
  if [ -f "$1" ]; then
    sz=$(wc -c < "$1" | tr -d ' ')
    printf "%s exists (%s bytes). Overwrite? [y/N] " "$1" "$sz"
    read -r ans
    case "$ans" in
      [Yy]*) ;;
      *) echo "Aborted."; exit 1 ;;
    esac
    mv "$1" "$1.bak"
    echo "Backed up to $1.bak"
  fi
}

dl() {
  url="$1"; out="$2"; minsz="$3"; desc="$4"
  echo "Downloading $desc..."
  if ! curl -fSL --max-time 120 "$url" -o "$out" 2>"$TMPDIR/curl_err.txt"; then
    echo "ERROR: Failed to download $url"
    cat "$TMPDIR/curl_err.txt" 2>/dev/null
    exit 1
  fi
  sz=$(wc -c < "$out" | tr -d ' ')
  if [ "$sz" -lt "$minsz" ]; then
    echo "ERROR: $desc too small (${sz} bytes)."
    exit 1
  fi
  if head -c 200 "$out" | grep -qi "<html"; then
    echo "ERROR: $desc looks like HTML error page."
    exit 1
  fi
  echo "  Got ${sz} bytes"
}

confirm_overwrite "$OUT_FULL"
confirm_overwrite "$OUT_WORDLE"

# === PART 1: Full wordlist for crosswords/fill-ins ===
echo "=== Building $OUT_FULL (full, for crosswords/fill-ins) ==="
dl "$SUPP_URL" "$TMPDIR/words_raw.txt" 1000000 "words_alpha.txt"
tr -d '\r' < "$TMPDIR/words_raw.txt" | tr 'a-z' 'A-Z' \
  | grep -E '^[A-Z]{3,9}$' | sort -u > "$TMPDIR/words.txt"
echo "  Got $(wc -l < "$TMPDIR/words.txt" | tr -d ' ') unique 3-9 letter words"

dl "$WN_URL" "$TMPDIR/wn31.tar.gz" 10000000 "WordNet 3.1"
tar -xzf "$TMPDIR/wn31.tar.gz" -C "$TMPDIR"
WNDICT=$(find "$TMPDIR" -name "data.noun" -exec dirname {} \; | head -1)
[ -n "$WNDICT" ] || { echo "ERROR: WordNet dict not found"; exit 1; }

echo "Parsing WordNet glosses..."
for f in "$WNDICT"/data.noun "$WNDICT"/data.verb "$WNDICT"/data.adj "$WNDICT"/data.adv; do
  [ -f "$f" ] || continue
  awk '
    function hex2dec(h,    n,i,c,v) {
      h=tolower(h); n=0
      for(i=1;i<=length(h);i++){c=substr(h,i,1);v=index("0123456789abcdef",c)-1;n=n*16+v}
      return n
    }
    /^\s*[0-9]/ {
      bar=index($0,"|"); if(bar==0) next
      gloss=substr($0,bar+1); gsub(/^[ \t]+/,"",gloss)
      n=split($0,parts," ")
      wcnt=hex2dec(parts[4])
      for(i=0;i<wcnt;i++) {
        w=parts[5+i*2]; gsub(/_/," ",w); w=tolower(w)
        if(w ~ /^[a-z]{3,9}$/ && !(w in seen)) {
          seen[w]=1
          g=substr(gloss,1,120); gsub(/["\\]/,"",g); gsub(/^[ \t]+|[ \t]+$/,"",g)
          print w "\t" g
        }
      }
    }' "$f"
done | sort -t "$(printf '\t')" -k1,1 -u > "$TMPDIR/glosses.txt"
echo "  Got $(wc -l < "$TMPDIR/glosses.txt" | tr -d ' ') glosses"

echo "Building $OUT_FULL..."
tr 'a-z' 'A-Z' < "$TMPDIR/glosses.txt" > "$TMPDIR/glosses_up.txt"
sort -u "$TMPDIR/words.txt" > "$TMPDIR/all_words.txt"
cut -f1 "$TMPDIR/glosses_up.txt" | sort -u > "$TMPDIR/defined_words.txt"
comm -12 "$TMPDIR/all_words.txt" "$TMPDIR/defined_words.txt" > "$TMPDIR/final_words.txt"
echo "  $(wc -l < "$TMPDIR/final_words.txt" | tr -d ' ') words with definitions"
{
  printf '/* Full wordlist: dwyl/english-words + WordNet 3.1. For crosswords/fill-ins. Rebuild: sh rebuild-words.sh */\n'
  printf 'const WORDS={'
  first=1
  for L in 3 4 5 6 7 8 9; do
    arr=$(awk -v l="$L" 'length==l' "$TMPDIR/final_words.txt" | sed 's/.*/"&"/' | paste -sd, -)
    [ "$first" -eq 1 ] && first=0 || printf ','
    printf '"%s":[%s]' "$L" "$arr"
  done
  printf '};\nconst DEFS={'
  join -t "$(printf '\t')" "$TMPDIR/final_words.txt" "$TMPDIR/glosses_up.txt" \
    | awk -F'\t' '{printf "\"%s\":\"%s\",", $1, $2}' | sed 's/,$//'
  printf '};\n'
} > "$OUT_FULL"
echo "Wrote $OUT_FULL ($(wc -c < "$OUT_FULL" | tr -d ' ') bytes)"

# === PART 2: Wordle wordlist (common words) ===
# Answers: google-10000-english (most frequent words, people know these).
# Guesses: words_alpha.txt (all valid words, from Part 1).
echo ""
echo "=== Building $OUT_WORDLE (common words, for Wordle) ==="
dl "$GOOGLE10K_URL" "$TMPDIR/google10k.txt" 50000 "google-10000-english"
tr -d '\r' < "$TMPDIR/google10k.txt" | tr 'a-z' 'A-Z' | grep -E '^[A-Z]{4,7}$' | sort -u > "$TMPDIR/wl_ans.txt"
# Guesses: reuse words.txt from Part 1 (already filtered 3-9, uppercase)
awk 'length >= 4 && length <= 7' "$TMPDIR/words.txt" | sort -u > "$TMPDIR/wl_all.txt"
echo "  Common (answers): $(wc -l < "$TMPDIR/wl_ans.txt" | tr -d ' '), All (guesses): $(wc -l < "$TMPDIR/wl_all.txt" | tr -d ' ')"
# Combine: answers first (for WORDLE_ANSWER_COUNTS slicing), then rest
comm -23 "$TMPDIR/wl_all.txt" "$TMPDIR/wl_ans.txt" > "$TMPDIR/wl_guess_only.txt"
cat "$TMPDIR/wl_ans.txt" "$TMPDIR/wl_guess_only.txt" > "$TMPDIR/wl_combined.txt"
{
  printf '/* Wordle wordlist: google-10000-english (common) + words_alpha.txt (guesses). Rebuild: sh rebuild-words.sh */\n'
  printf 'const WORDS={'
  first=1
  # Wordle uses 4-7 letter words (per DIFFS in wordle/script.js)
  for L in 4 5 6 7; do
    arr=$(awk -v l="$L" 'length==l' "$TMPDIR/wl_combined.txt" | sed 's/.*/"&"/' | paste -sd, -)
    [ "$first" -eq 1 ] && first=0 || printf ','
    printf '"%s":[%s]' "$L" "$arr"
  done
  printf '};\n'
  # WORDLE_ANSWER_COUNTS: number of answers per length (for slicing the curated prefix)
  printf 'const WORDLE_ANSWER_COUNTS={'
  first=1
  for L in 4 5 6 7; do
    n=$(awk -v l="$L" 'length==l' "$TMPDIR/wl_ans.txt" | wc -l | tr -d ' ')
    [ "$first" -eq 1 ] && first=0 || printf ','
    printf '"%s":%s' "$L" "$n"
  done
  printf '};\n'
} > "$OUT_WORDLE"
echo "Wrote $OUT_WORDLE ($(wc -c < "$OUT_WORDLE" | tr -d ' ') bytes)"
echo "Done."
