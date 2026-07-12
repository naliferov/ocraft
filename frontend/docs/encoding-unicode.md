The first version of Unicode (1991) was a fixed-width 16-bit encoding; the total number of distinct characters was 2 to the 16th power (65,536).

The second version of Unicode (1996) significantly expanded the code area; to maintain compatibility with systems that had already implemented 16-bit Unicode, UTF-16 was created. The range 0xD800—0xDFFF, set aside for surrogate pairs, had previously belonged to the "private use characters" area.

Since UTF-16 can represent 220+216−2048 (1,112,064) characters, this number was chosen as the new size of the Unicode code space. up to U+10FFFF

Each character is assigned a unique identifier. These identifiers are called code points. Code point. In Unicode, a code point is conventionally written in hexadecimal form using at least 4 digits, with leading zeros added when necessary.

27 - 1B - U+001B Unicode has planes of values, or ranges. For example, U+0000 - U+FFFF is the Basic Multilingual Plane. Then come the "astral planes".

Variation selectors. Invisible characters that change the glyph of the characters preceding them. FE00—FE0F

## 3 encoding standards: UTF-8, UTF-16, UTF-32

UTF-32 is a **fixed** -length encoding. It uses 32 bits to encode each character. With this encoding you can encode more than 4 billion characters. UTF-8 (1-4 bytes) and UTF-16 (2-4 bytes) are variable-length encodings.

javascript uses UTF-16. To encode characters above 65535, it needs surrogate pairs.

-   U+D800—U+DBFF (1,024 code points): high surrogates
-   U+DC00—U+DFFF (1,024 code points): low surrogates

UTF-8 encodes code points in one to four bytes, depending on the value of the code point. UTF-8 The first 128 code points (ASCII) need one byte. The next 1,920 code points need two bytes to encode, which covers the remainder of almost all [Latin-script alphabets](https://en.wikipedia.org/wiki/Latin-script_alphabet "Latin-script alphabet")
