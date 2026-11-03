# Translation style

How each language sounds in OpenMarch. Translators (people and AI) follow this together with
the agreed words in `glossary.json` and the note for each key in `context.json`. Drafted
2026-11-02; a native-speaking reviewer may change any rule here.

## Every language

- Translate what the string means where it appears, using its note. Don't translate word for
  word, and don't add or drop information.
- Keep every `{argument}`, `#` and `<tag></tag>` the English uses, unchanged, but move them
  wherever the sentence needs them. Translate the words inside plural and select branches;
  never translate argument names, select keys or plural keywords (`one`, `other`, `=1`).
- Plurals follow the language's own forms (CLDR). Keep an `other` branch. Keep `=1` branches
  as `=1`.
- Buttons and menu items are short and follow the platform convention for the language
  (what macOS and Windows show in that language). Keep them about as long as the English;
  a much longer label may not fit.
- "OpenMarch" and file extensions (`.dots`, `.glb`) stay as they are. Product names (Pyware,
  MuseScore), file formats (PDF, CSV, MusicXML) and units written as symbols stay as they are.
- Strings the note calls "search words" are never shown: write words people in that language
  would type to find the action, separated by spaces. Keep the English words too, so an
  English search still finds it.
- Keep the English capitalization style only where the language uses it. Most of these
  languages use sentence case for everything.
- Keyboard keys inside a string are tags (`<keys></keys>`); never write key names as text.

## Español (`es`)

- Neutral Latin American Spanish, the one most bands using OpenMarch speak. Avoid words that
  only Spain uses (ordenador → computadora, fichero → archivo, móvil → celular).
- Address the user as **tú**. Commands use the imperative ("Selecciona"), buttons the
  infinitive ("Guardar", "Agregar").
- "Agregar" rather than "Añadir"; "Eliminar" for delete; "Deshacer" / "Rehacer".
- Opening ¿ and ¡ always.

## Français (`fr`)

- Address the user as **vous**. Buttons use the infinitive ("Enregistrer", "Supprimer").
- French typography: a non-breaking space (U+00A0) before `:` and a narrow non-breaking
  space (U+202F) before `;`, `?` and `!`. Guillemets « » with non-breaking spaces inside.
- Sentence case for titles and buttons.

## Português do Brasil (`pt-BR`)

- Brazilian Portuguese only (tela, arquivo, celular; never ecrã, ficheiro, telemóvel).
- Address the user as **você**. Buttons use the infinitive ("Salvar", "Excluir").
- "Excluir" for delete, "Desfazer" / "Refazer".

## 日本語 (`ja`)

- Sentences and messages (toasts, dialogs, tooltips that are sentences) use です・ます.
- Buttons, menu items and labels are short: a noun or a verb stem with no ます
  ("保存", "削除", "ページを追加"). Follow what macOS and Windows show in Japanese.
- No spaces between Japanese words. Put no space between Japanese and an `{argument}` or a
  number either, unless it reads badly without one (a Latin word next to kana).
- Full-width 、。「」 and ？！ in Japanese text; half-width digits and Latin letters.
- Japanese has no grammatical plural. A plural message may become one plain string with `#`
  or the argument, or keep only the `other` branch, and must not invent a `one` branch.
- Katakana loanwords use the long-vowel mark the way major software does (ユーザー,
  フォルダー, ファイル).

## Bahasa Indonesia (`id`)

- Standard Indonesian as software uses it (Google, Microsoft). Address the user politely and
  neutrally; avoid "kamu" and "Anda" where a sentence works without a pronoun, and use "Anda"
  where one is needed.
- Buttons and menu items are verbs in the base form ("Simpan", "Hapus", "Tambahkan halaman").
- Keep the English word where Indonesian marching bands and video editors do (keyframe,
  playhead, drill, color guard) rather than coining one.

## Bahasa Melayu (`ms`)

- Malaysian Malay (Bahasa Malaysia), not Indonesian: "padam" not "hapus", "fail" not "file",
  "tetapan" not "pengaturan", "komputer", "muat turun".
- Address the user as "anda" (lowercase) only where a pronoun is needed.
- Buttons and menu items are verbs in the base form ("Simpan", "Padam").

## Filipino (`fil`)

- Filipino as Philippine software uses it: Tagalog grammar, with English kept for technical
  and marching terms people actually say in English (drill, field, timeline, keyframe, file).
  Don't coin Tagalog words nobody uses; natural Taglish is better than stiff Tagalog.
- Polite but not formal; avoid "po" in interface text.
- Buttons and menu items are short verbs ("I-save", "Burahin", "Magdagdag ng pahina").

## 简体中文 (`zh-Hans`)

- Simplified Chinese as used in mainland China and Singapore, in the terms Chinese software
  uses (文件, 设置, 撤销, 重做, 删除).
- Full-width punctuation (，。：；？！「」 or “”) in Chinese text; half-width digits and Latin
  letters. No spaces between Chinese characters; no space is needed between Chinese and a
  number or Latin word either.
- Address the user as 你 only where a pronoun is needed; most interface text needs none.
- Chinese has no plural: a plural message may become one plain string with `#` or the
  argument, or keep only the `other` branch.

## 繁體中文 (`zh-Hant`)

- Traditional Chinese as used in Taiwan, with Taiwan's software vocabulary, not mainland
  vocabulary in Traditional characters: 檔案 (not 文件), 設定, 復原, 取消復原 or 重做, 刪除,
  影片, 軟體, 預設, 資料.
- Full-width punctuation 「」，。：；？！; half-width digits and Latin letters. No spaces
  between Chinese characters.
- Address the user as 你 only where a pronoun is needed.
- Same plural rule as Simplified Chinese.

## ไทย (`th`)

- Thai as Thai software uses it (Windows, macOS, Google in Thai). Polite and neutral; no
  particles such as ครับ/ค่ะ in interface text.
- Thai has no spaces between words; a space separates phrases and sentences. Don't put spaces
  between words.
- Keep loanwords Thai users already read in English or Thai transliteration (คีย์เฟรม,
  ไทม์ไลน์, ดริล) consistent with the glossary.
- Thai has no plural: a plural message may become one plain string or keep only `other`.
- Half-width (Arabic) digits, not Thai digits.
