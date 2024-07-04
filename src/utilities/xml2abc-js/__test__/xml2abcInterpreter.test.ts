/**
 * Tests that xml2abcInterpreter correctly converts MusicXML to ABC
 *
 * NOTE - this is a single test and is extremely limited in scope. It is not a comprehensive test of the xml2abcInterpreter function.
 */

import xml2abcInterpreter from "../xml2abcInterpreter";


const expectedAbc = `X:1
T:The Cadets 2016 "Awakening"
%%scale 0.83
%%pagewidth 21.59cm
%%leftmargin 1.00cm
%%rightmargin 1.00cm
L:1/8
Q:1/4=120
M:6/4
I:linebreak $
K:none
V:1 treble transpose=-2 nm="Solo B♭ Trumpet" snm="S. B♭ Tpt."
V:1
[K:C]"^\\n" z12 |[M:4/4] z8 |[M:6/4] z12 ||[M:4/4] z8 | z8 | z8 | z8 | z8 || %8
[K:C][M:5/4][Q:1/4=88] z10 | z10 | z10 | z10 | z10 | z10 | z10 | z10 | z10 | z10 | %18
[M:4/4][Q:1/4=76] z8 || z8 | z8 | z8 | z8 |"^Mute" z z/ B/ e2- eB (3eBe | z z/ G/ c2- cG (3cGc || %25
 d/c/-c- c6 | z8 | z8 | z8 |[K:Bb] z8 | z8 ||[K:Eb] z8 | z8 | z8 | z8 ||[K:C] z8 | z8 | z8 | z8 | %39
[K:E] z8 ||[K:G] z8 |[K:B] z8 |[K:C#] z8 ||[K:F] z8 | z8 | z8 | z8 | z8 | z8 | z8 || z8 | z8 | z8 | %53
[K:G][M:2/4][Q:1/4=184] z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | %68
 z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 || z4 | z4 | z4 | z4 | z4 | %87
 z4 | z4 | z4 |"^C" z4 || z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 ||"^D" z4 | z4 | z4 | z4 | %104
 z4 | z4 | z4 | z4 | z4 | z4 | z4 ||"^E" z4 | z4 | z4 | z4 | z4 || z4 | z4 |[K:G]"^E8" z4 | z4 | %120
 z4 | z4 | z4 | z4 ||[M:3/8][Q:3/16=184]"^E14" z3 | z3 | z3 | z3 | z3 | z3 || z3 |[K:Bb]"^F" z3 | %132
 z3 | z3 | z3 |"^F5" z3 |[M:6/8] z6 ||[K:Eb][M:3/8] z3 | z3 | z3 | z3 | z3 | z3 ||"^F11" z3 | z3 | %145
 z3 | z3 | z3 | z3 | z3 | z3 | z3 | z3 | z3 | z3 ||[K:A]"^F23" z3 | z3 | z3 | z3 |"^F27" z3 | z3 | %161
 z3 | z3 ||"^F31" z3 | z3 | z3 | z3 ||[M:2/4][Q:1/4=184]"^G" z4 | z4 | z4 | z4 | z4 | z4 | z4 | %174
 z4 | z4 | z4 | z4 | z4 ||[K:Ab]"^H" z4 | z4 | z4 | z4 | z4 | z4 ||"^H7" z4 | z4 | z4 | z4 | z4 | %190
 z4 ||[K:C]"^I" z2 (3z z"^Staff Text" G | (3c z c (3e z e | (3ded (3cBA | (3G z G (3c z c | %195
 (3e z e d2 | c z z2 | z4 | z4 | z4 | z4 ||[K:Bb]"^J" z4 | z4 | z4 | z4 | z4 | z4 | z4 || %208
[K:F][M:3/8][Q:3/16=184]"^K" z3 | z3 | z3 | z3 | z3 | z3 | z3 | z3 ||"^K9" z3 | z3 | z3 | z3 | %220
"^K13" z3 | z3 | z3 ||"^K16" z3 |[M:9/16] z9/2 |[M:3/8] z3 ||"^K19" z3 | z3 | z3 | z3 | z3 | %231
[M:2/4][Q:1/4=184] z4 || z4 | z4 | z4 ||[M:4/4]"^K28" z8 | z8 |[M:2/4][Q:1/4=112] z4 | z4 | z4 | %240
 z4 ||[M:2/4] z4 | z4 | z2!f! .c(c/4d/4e/4f/4) | .g/.f/.g/.f/ e/.f/.g | ag/.f/ g.g/.e/ | %246
 .d A2 f/e/ | .d A2 e |[Q:1/4=128] ._d z z2 | z4 | z4 | z4 | z4 |[K:E] z4 | z4 | z4 | z4 | z4 | %258
 z4 |[Q:1/4=190] z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 | z4 |[Q:1/4=200] z4 |[M:4/4] z8 | z8 | %272
 z8 | z8 | z8 | z8 | z8 | z8 | z8 ||[K:Bb] z8 | z8 | z8 | z8 |[K:C] z8 | z8 | z8 | z8 | z8 | z8 | %289
 z8 | z8 | z8 || z8 | z8 | z8 | z8 ||[Q:1/4=92] z8 | z8 |!mf! E4 e4- | e8 | z8 | z8 | E6 e2- | e8 | %304
 z8 || z8 | z4 z3/2 .a/ ^f3/2(g/4f/4 |[M:6/4] B4) f8 |[M:4/4] z8 | z8 | z8 | z8 | z8 | z8 | z8 | %315
[M:7/4]!f![Q:1/4=74] c8- c6- |[M:3/4][Q:1/4=56] c6- |[M:4/4][Q:1/4=112] c2 (B2 A2 E2) | G2 F4 c2- | %319
 c2 B2 A2 E2 | d2 ed e2 g2- | g2 f2 _e2 c2 | d4 ^c4 | c'4 _b4 |[M:2/4][Q:1/4=56] _a4 | %325
[M:4/4][Q:1/4=100] g8 |[M:6/4]"^rit." z12 |[M:4/4][Q:1/4=90] z8 | z8 | z8 | z8 | z8 | z8 | z8 | %334
 z8 |"^rit." z8 | z8 |[Q:1/4=52] z8 | z8 | z8 ||[Q:1/4=90] z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | %348
 z8 | z8 || z8 | z8 | z8 | z8 ||[M:12/8][Q:3/8=184] z12 | z12 | z12 | z12 || %358
!f!"^Muted" b3/2 z/ _b a3/2 z/ b =b3 (^ga_b) | b3/2 z/ _a g3/2 z/ _b =b3/2 z/ g ^f3/2 z/ _b | %360
 f6 z2 z4 | z12 | z12 | z12 | z12 | z6 z2 a _ag_g | f3/2 z/ g _a3/2 z/ c' _d'3/2 z/ z e3/2 z z/ | %367
 ^d6 B3/2 z/ z d3/2 z/ z | _a3/2 z/ z B3/2 z/ z ^A6 |[M:3/4] g[Q:1/4=184] z4 z | z6 |[M:4/4] z8 | %372
 z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | %391
 z8 | z8 | z8 || z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 ||[K:Bb][Q:1/4=96] z8 | z8 | %407
 z8 | z8 | z8 | z8 | z8 | z8 || z8 | z8 | z8 |[M:3/4][Q:1/4=198] z6 | z6 | z6 | z6 || %420
[K:Eb][M:4/4] z8 | z8 | z8 |[K:Bb] z8 | z8 | z8 |[K:G] z8 | z8 |[K:C#] z8 | z8 |[Q:1/4=80] z8 | %431
 z8 ||[K:C][Q:1/4=76] z8 | z8 |[K:B] z8 |[K:C#] z8 |[K:F] z8 | z8 | z8 | z8 | z8 | z8 | z8 | z8 | %444
 z8 | z8 |] %446
`

const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>The Cadets 2016 &quot;Awakening&quot;</work-title>
    </work>
  <identification>
    <encoding>
      <software>MuseScore 4.2.1</software>
      <encoding-date>2024-06-02</encoding-date>
      <supports element="accidental" type="yes"/>
      <supports element="beam" type="yes"/>
      <supports element="print" attribute="new-page" type="no"/>
      <supports element="print" attribute="new-system" type="no"/>
      <supports element="stem" type="yes"/>
      </encoding>
    <source>https://musescore.com/themtcrew/awakening</source>
    </identification>
  <defaults>
    <scaling>
      <millimeters>7.05556</millimeters>
      <tenths>40</tenths>
      </scaling>
    <page-layout>
      <page-height>1584</page-height>
      <page-width>1224</page-width>
      <page-margins type="even">
        <left-margin>56.6929</left-margin>
        <right-margin>56.6929</right-margin>
        <top-margin>56.6929</top-margin>
        <bottom-margin>113.386</bottom-margin>
        </page-margins>
      <page-margins type="odd">
        <left-margin>56.6929</left-margin>
        <right-margin>56.6929</right-margin>
        <top-margin>56.6929</top-margin>
        <bottom-margin>113.386</bottom-margin>
        </page-margins>
      </page-layout>
    <appearance>
      <line-width type="light barline">1.6</line-width>
      <line-width type="heavy barline">5</line-width>
      <line-width type="beam">5</line-width>
      <line-width type="bracket">4.5</line-width>
      <line-width type="dashes">1.5</line-width>
      <line-width type="enclosure">2</line-width>
      <line-width type="ending">1</line-width>
      <line-width type="extend">1</line-width>
      <line-width type="leger">1.6</line-width>
      <line-width type="pedal">1.5</line-width>
      <line-width type="octave shift">1</line-width>
      <line-width type="slur middle">1.5</line-width>
      <line-width type="slur tip">0.7</line-width>
      <line-width type="staff">0.8</line-width>
      <line-width type="stem">1.3</line-width>
      <line-width type="tie middle">1.5</line-width>
      <line-width type="tie tip">0.7</line-width>
      <line-width type="tuplet bracket">1</line-width>
      <line-width type="wedge">1.3</line-width>
      <note-size type="cue">70</note-size>
      <note-size type="grace">70</note-size>
      <note-size type="grace-cue">49</note-size>
      </appearance>
    <music-font font-family="Emmentaler"/>
    <word-font font-family="FreeSerif" font-size="10"/>
    <lyric-font font-family="FreeSerif" font-size="11"/>
    </defaults>
  <credit page="1">
    <credit-type>title</credit-type>
    <credit-words default-x="612" default-y="1527.31" justify="center" valign="top" font-weight="bold" underline="1" font-size="39">The Cadets 2016 - &quot;Awakening&quot;
</credit-words>
    <credit-words font-weight="normal" underline="0" font-size="29">Arranged by TheMTCrew</credit-words>
    </credit>
  <credit page="1">
    <credit-words default-x="56.6929" default-y="1527.31" justify="left" valign="top" font-size="18">B♭ Trumpet</credit-words>
    </credit>
  <part-list>
    <score-part id="P1">
      <part-name>Solo B♭ Trumpet</part-name>
      <part-abbreviation>S. B♭ Tpt.</part-abbreviation>
      <score-instrument id="P1-I1">
        <instrument-name>B♭ Trumpet</instrument-name>
        <instrument-sound>brass.trumpet.bflat</instrument-sound>
        </score-instrument>
      <midi-device id="P1-I1" port="1"></midi-device>
      <midi-instrument id="P1-I1">
        <midi-channel>1</midi-channel>
        <midi-program>57</midi-program>
        <volume>78.7402</volume>
        <pan>0</pan>
        </midi-instrument>
      </score-part>
    </part-list>
  <part id="P1">
    <measure number="1" width="167.25">
      <print>
        <system-layout>
          <system-margins>
            <left-margin>-0.00</left-margin>
            <right-margin>0.00</right-margin>
            </system-margins>
          <top-system-distance>70.00</top-system-distance>
          </system-layout>
        </print>
      <attributes>
        <divisions>24</divisions>
        <key>
          <fifths>0</fifths>
          </key>
        <time>
          <beats>6</beats>
          <beat-type>4</beat-type>
          </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
          </clef>
        <transpose>
          <diatonic>-1</diatonic>
          <chromatic>-2</chromatic>
          </transpose>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-36.00" default-y="16.42" relative-x="0.32" relative-y="6.39">
            <beat-unit>quarter</beat-unit>
            <per-minute>120</per-minute>
            </metronome>
          </direction-type>
        <direction-type>
          <words default-x="-36.00" default-y="16.42" relative-x="0.32" relative-y="6.39" font-weight="bold" font-family="Edwin" font-size="12">
</words>
          <words></words>
          </direction-type>
        <sound tempo="120"/>
        </direction>
      <note default-x="104.95" default-y="-10.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="2" width="104.30">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <note default-x="54.38" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="3" width="128.75">
      <attributes>
        <time>
          <beats>6</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <note default-x="63.50" default-y="-10.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="4" width="0.00">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>5</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="5" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="6" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="7" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="8" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="9" width="0.00">
      <attributes>
        <key>
          <fifths>0</fifths>
          </key>
        <time>
          <beats>5</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>10</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>88</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="88"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="10" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="11" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="12" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="13" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="14" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="15" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="16" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="17" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="18" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>120</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="19" width="110.45">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-29.50" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>76</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="76"/>
        </direction>
      <note default-x="54.32" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="20" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="21" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="22" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="23" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="24" width="191.09">
      <direction placement="above">
        <direction-type>
          <words relative-y="40.00">Mute</words>
          </direction-type>
        </direction>
      <note default-x="12.12" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="32.31" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="46.80" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        </note>
      <note default-x="63.79" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      <note default-x="94.08" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      <note default-x="114.27" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        </note>
      <note default-x="134.46" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations>
          <tuplet type="start" bracket="no"/>
          </notations>
        </note>
      <note default-x="150.39" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">continue</beam>
        </note>
      <note default-x="166.32" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="25" width="269.19">
      <note default-x="58.20" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="80.96" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="96.14" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>up</stem>
        </note>
      <note default-x="122.64" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      <note default-x="156.79" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">begin</beam>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      <note default-x="179.55" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>up</stem>
        <beam number="1">end</beam>
        </note>
      <note default-x="202.31" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>up</stem>
        <beam number="1">begin</beam>
        <notations>
          <tuplet type="start" bracket="no"/>
          </notations>
        </note>
      <note default-x="220.27" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>up</stem>
        <beam number="1">continue</beam>
        </note>
      <note default-x="238.23" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>up</stem>
        <beam number="1">end</beam>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="26" width="132.62">
      <note default-x="12.00" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <beam number="2">begin</beam>
        </note>
      <note default-x="27.67" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">end</beam>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      <note default-x="43.33" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <tie type="stop"/>
        <tie type="start"/>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations>
          <tied type="stop"/>
          <tied type="start"/>
          </notations>
        </note>
      <note default-x="65.73" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>72</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <stem>down</stem>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="27" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="28" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="29" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="30" width="0.00">
      <attributes>
        <key>
          <fifths>-2</fifths>
          </key>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="31" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="32" width="0.00">
      <attributes>
        <key>
          <fifths>-3</fifths>
          </key>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="33" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="34" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="35" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="36" width="0.00">
      <attributes>
        <key>
          <fifths>0</fifths>
          </key>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="37" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="38" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="39" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="40" width="169.92">
      <attributes>
        <key>
          <fifths>4</fifths>
          </key>
        </attributes>
      <note default-x="87.62" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="41" width="124.88">
      <attributes>
        <key>
          <fifths>1</fifths>
          </key>
        </attributes>
      <note default-x="80.66" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="42" width="123.34">
      <attributes>
        <key>
          <fifths>5</fifths>
          </key>
        </attributes>
      <note default-x="82.87" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="43" width="151.63">
      <attributes>
        <key>
          <fifths>7</fifths>
          </key>
        </attributes>
      <note default-x="104.95" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="44" width="0.00">
      <attributes>
        <key>
          <fifths>-1</fifths>
          </key>
        <measure-style>
          <multiple-rest>7</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="45" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="46" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="47" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="48" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="49" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="50" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="51" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="52" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="53" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="54" width="0.00">
      <attributes>
        <key>
          <fifths>1</fifths>
          </key>
        <time>
          <beats>2</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>29</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="184"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="55" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="56" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="57" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="58" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="59" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="60" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="61" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="62" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="63" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="64" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="65" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="66" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="67" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="68" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="69" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="70" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="71" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="72" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="73" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="74" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="75" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="76" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="77" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="78" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="79" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="80" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="81" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="82" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="83" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>8</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="84" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="85" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="86" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="87" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="88" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="89" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="90" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="91" width="51.30">
      <direction placement="above">
        <direction-type>
          <rehearsal default-x="-12.00" relative-y="30.00" font-weight="bold" font-size="14">C</rehearsal>
          </direction-type>
        </direction>
      <note default-x="14.25" default-y="-10.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="92" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>9</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="93" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="94" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="95" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="96" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="97" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="98" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="99" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="100" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="101" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>11</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">D</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="102" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="103" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="104" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="105" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="106" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="107" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="108" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="109" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="110" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="111" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="112" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>5</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">E</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="113" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="114" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="115" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="116" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="117" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="118" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="119" width="0.00">
      <attributes>
        <key>
          <fifths>1</fifths>
          </key>
        <measure-style>
          <multiple-rest>6</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">E8</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="120" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="121" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="122" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="123" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="124" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="125" width="0.00">
      <attributes>
        <time>
          <beats>3</beats>
          <beat-type>8</beat-type>
          </time>
        <measure-style>
          <multiple-rest>6</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>eighth</beat-unit>
            <beat-unit-dot/>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="138"/>
        </direction>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">E14</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="126" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="127" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="128" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="129" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="130" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="131" width="50.00">
      <note default-x="16.70" default-y="-10.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="132" width="0.00">
      <attributes>
        <key>
          <fifths>-2</fifths>
          </key>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">F</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="133" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="134" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="135" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="136" width="50.00">
      <direction placement="above">
        <direction-type>
          <rehearsal default-x="-12.00" relative-y="30.00" font-weight="bold" font-size="14">F5</rehearsal>
          </direction-type>
        </direction>
      <note default-x="16.70" default-y="-10.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="137" width="87.66">
      <attributes>
        <time>
          <beats>6</beats>
          <beat-type>8</beat-type>
          </time>
        </attributes>
      <note default-x="42.40" default-y="-10.00">
        <rest measure="yes"/>
        <duration>72</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="138" width="0.00">
      <attributes>
        <key>
          <fifths>-3</fifths>
          </key>
        <time>
          <beats>3</beats>
          <beat-type>8</beat-type>
          </time>
        <measure-style>
          <multiple-rest>6</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="139" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="140" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="141" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="142" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="143" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="144" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>12</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">F11</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="145" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="146" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="147" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="148" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="149" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="150" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="151" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="152" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="153" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="154" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="155" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="156" width="0.00">
      <attributes>
        <key>
          <fifths>3</fifths>
          </key>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">F23</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="157" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="158" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="159" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="160" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">F27</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="161" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="162" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="163" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="164" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">F31</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="165" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="166" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="167" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="168" width="0.00">
      <attributes>
        <time>
          <beats>2</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>12</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="184"/>
        </direction>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">G</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="169" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="170" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="171" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="172" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="173" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="174" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="175" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="176" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="177" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="178" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="179" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="180" width="0.00">
      <attributes>
        <key>
          <fifths>-4</fifths>
          </key>
        <measure-style>
          <multiple-rest>6</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">H</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="181" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="182" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="183" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="184" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="185" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="186" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>6</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">H7</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="187" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="188" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="189" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="190" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="191" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="192" width="170.17">
      <attributes>
        <key>
          <fifths>0</fifths>
          </key>
        </attributes>
      <direction placement="above">
        <direction-type>
          <rehearsal default-x="-61.84" relative-y="30.00" font-weight="bold" font-size="14">I</rehearsal>
          </direction-type>
        </direction>
      <note default-x="61.84" default-y="-20.00">
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        </note>
      <note default-x="98.52" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <notations>
          <tuplet type="start" bracket="yes"/>
          </notations>
        </note>
      <note default-x="117.81" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        </note>
      <direction placement="above">
        <direction-type>
          <words relative-y="40.00">Staff Text</words>
          </direction-type>
        </direction>
      <note default-x="137.10" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>up</stem>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="193" width="133.22">
      <note default-x="12.00" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="start" bracket="yes"/>
          </notations>
        </note>
      <note default-x="31.29" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        </note>
      <note default-x="50.58" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      <note default-x="69.87" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="start" bracket="yes"/>
          </notations>
        </note>
      <note default-x="89.16" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        </note>
      <note default-x="108.45" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="194" width="133.22">
      <note default-x="12.00" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations>
          <tuplet type="start" bracket="no"/>
          </notations>
        </note>
      <note default-x="31.29" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">continue</beam>
        </note>
      <note default-x="50.58" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      <note default-x="69.87" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations>
          <tuplet type="start" bracket="no"/>
          </notations>
        </note>
      <note default-x="89.16" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">continue</beam>
        </note>
      <note default-x="108.45" default-y="-25.00">
        <pitch>
          <step>A</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="195" width="190.10">
      <note default-x="58.20" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>up</stem>
        <notations>
          <tuplet type="start" bracket="yes"/>
          </notations>
        </note>
      <note default-x="84.79" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        </note>
      <note default-x="102.81" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>up</stem>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      <note default-x="129.29" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="start" bracket="yes"/>
          </notations>
        </note>
      <note default-x="147.31" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        </note>
      <note default-x="165.33" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="196" width="101.93">
      <note default-x="12.00" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="start" bracket="yes"/>
          </notations>
        </note>
      <note default-x="30.02" default-y="-20.00">
        <rest/>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        </note>
      <note default-x="48.04" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>8</duration>
        <voice>1</voice>
        <type>eighth</type>
        <time-modification>
          <actual-notes>3</actual-notes>
          <normal-notes>2</normal-notes>
          </time-modification>
        <stem>down</stem>
        <notations>
          <tuplet type="stop"/>
          </notations>
        </note>
      <note default-x="66.06" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="197" width="93.56">
      <note default-x="12.00" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <note default-x="34.84" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="57.69" default-y="-20.00">
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        </note>
      </measure>
    <measure number="198" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="199" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="200" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="201" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="202" width="0.00">
      <attributes>
        <key>
          <fifths>-2</fifths>
          </key>
        <measure-style>
          <multiple-rest>7</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">J</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="203" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="204" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="205" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="206" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="207" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="208" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="209" width="0.00">
      <attributes>
        <key>
          <fifths>-1</fifths>
          </key>
        <time>
          <beats>3</beats>
          <beat-type>8</beat-type>
          </time>
        <measure-style>
          <multiple-rest>8</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>eighth</beat-unit>
            <beat-unit-dot/>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="138"/>
        </direction>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">K</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="210" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="211" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="212" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="213" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="214" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="215" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="216" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="217" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">K9</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="218" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="219" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="220" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="221" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">K13</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="222" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="223" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="224" width="57.04">
      <direction placement="above">
        <direction-type>
          <rehearsal default-x="-12.00" relative-y="30.00" font-weight="bold" font-size="14">K16</rehearsal>
          </direction-type>
        </direction>
      <note default-x="20.22" default-y="-10.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="225" width="126.42">
      <attributes>
        <time>
          <beats>9</beats>
          <beat-type>16</beat-type>
          </time>
        </attributes>
      <note default-x="58.09" default-y="-10.00">
        <rest measure="yes"/>
        <duration>54</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="226" width="156.69">
      <attributes>
        <time>
          <beats>3</beats>
          <beat-type>8</beat-type>
          </time>
        </attributes>
      <note default-x="105.52" default-y="-10.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="227" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>5</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">K19</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="228" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="229" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="230" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="231" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>36</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="232" width="103.52">
      <attributes>
        <time>
          <beats>2</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-29.50" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="184"/>
        </direction>
      <note default-x="50.86" default-y="-10.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="233" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="234" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="235" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="236" width="0.00">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <rehearsal relative-y="30.00" font-weight="bold" font-size="14">K28</rehearsal>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="237" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="238" width="0.00">
      <attributes>
        <time>
          <beats>2</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>112</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="112"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="239" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="240" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="241" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="242" width="0.00">
      <attributes>
        <time>
          <beats>2</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="243" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="244" width="152.73">
      <note default-x="12.94" default-y="-20.00">
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        </note>
      <direction placement="below">
        <direction-type>
          <dynamics default-x="6.58" default-y="-41.18" relative-y="-40.00">
            <f/>
            </dynamics>
          </direction-type>
        <sound dynamics="106.67"/>
        </direction>
      <note default-x="53.75" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="80.96" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>32nd</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">begin</beam>
        <beam number="3">begin</beam>
        <notations>
          <slur type="start" number="1"/>
          </notations>
        </note>
      <note default-x="96.63" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>32nd</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">continue</beam>
        <beam number="3">continue</beam>
        </note>
      <note default-x="112.30" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>32nd</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">continue</beam>
        <beam number="3">continue</beam>
        </note>
      <note default-x="127.96" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>32nd</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">end</beam>
        <beam number="3">end</beam>
        <notations>
          <slur type="stop" number="1"/>
          </notations>
        </note>
      </measure>
    <measure number="245" width="149.65">
      <note default-x="12.00" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <beam number="2">begin</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="30.14" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">continue</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="48.28" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">continue</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="66.42" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">end</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="84.56" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <beam number="2">begin</beam>
        </note>
      <note default-x="102.70" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">end</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="120.84" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      </measure>
    <measure number="246" width="210.36">
      <note default-x="77.21" default-y="10.00">
        <pitch>
          <step>A</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        </note>
      <note default-x="104.30" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">begin</beam>
        </note>
      <note default-x="122.37" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">end</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="140.43" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        </note>
      <note default-x="167.53" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">begin</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="185.60" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">end</beam>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      </measure>
    <measure number="247" width="122.58">
      <note default-x="12.00" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="39.10" default-y="-25.00">
        <pitch>
          <step>A</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="79.74" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <beam number="2">begin</beam>
        </note>
      <note default-x="97.81" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">end</beam>
        </note>
      </measure>
    <measure number="248" width="108.44">
      <note default-x="12.00" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="39.10" default-y="-25.00">
        <pitch>
          <step>A</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="79.74" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="249" width="110.65">
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>128</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="128"/>
        </direction>
      <note default-x="14.21" default-y="-10.00">
        <pitch>
          <step>D</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="41.30" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="68.40" default-y="-20.00">
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        </note>
      </measure>
    <measure number="250" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="251" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="252" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="253" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="254" width="0.00">
      <attributes>
        <key>
          <fifths>4</fifths>
          </key>
        <measure-style>
          <multiple-rest>6</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="255" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="256" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="257" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="258" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="259" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="260" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>10</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>190</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="190"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="261" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="262" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="263" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="264" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="265" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="266" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="267" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="268" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="269" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="270" width="100.63">
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>200</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="200"/>
        </direction>
      <note default-x="28.99" default-y="-10.00">
        <rest measure="yes"/>
        <duration>48</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="271" width="0.00">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>9</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="272" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="273" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="274" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="275" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="276" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="277" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="278" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="279" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="280" width="0.00">
      <attributes>
        <key>
          <fifths>-2</fifths>
          </key>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="281" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="282" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="283" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="284" width="0.00">
      <attributes>
        <key>
          <fifths>0</fifths>
          </key>
        <measure-style>
          <multiple-rest>9</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="285" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="286" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="287" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="288" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="289" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="290" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="291" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="292" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="293" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="294" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="295" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="296" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="297" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>92</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="92"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="298" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="299" width="86.53">
      <direction placement="below">
        <direction-type>
          <dynamics default-x="4.94" default-y="-40.00" relative-y="-40.00">
            <mf/>
            </dynamics>
          </direction-type>
        <sound dynamics="88.89"/>
        </direction>
      <note default-x="12.00" default-y="-40.00">
        <pitch>
          <step>E</step>
          <octave>4</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>up</stem>
        </note>
      <note default-x="48.29" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>48</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>half</type>
        <stem>down</stem>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      </measure>
    <measure number="300" width="71.35">
      <note default-x="12.00" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>96</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>whole</type>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="301" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="302" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="303" width="84.15">
      <note default-x="12.00" default-y="-40.00">
        <pitch>
          <step>E</step>
          <octave>4</octave>
          </pitch>
        <duration>72</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <stem>up</stem>
        </note>
      <note default-x="58.36" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      </measure>
    <measure number="304" width="71.35">
      <note default-x="12.00" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>96</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>whole</type>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      </measure>
    <measure number="305" width="74.23">
      <note default-x="25.71" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="306" width="125.29">
      <note default-x="70.94" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="307" width="178.09">
      <note default-x="12.00" default-y="-20.00">
        <rest/>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        </note>
      <note default-x="55.66" default-y="-20.00">
        <rest/>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        </note>
      <note default-x="80.26" default-y="10.00">
        <pitch>
          <step>A</step>
          <octave>5</octave>
          </pitch>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        <stem>down</stem>
        <notations>
          <articulations>
            <staccato/>
            </articulations>
          </notations>
        </note>
      <note default-x="111.46" default-y="0.00">
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <accidental>sharp</accidental>
        <stem>down</stem>
        <beam number="1">begin</beam>
        </note>
      <note default-x="137.66" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>32nd</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        <beam number="2">begin</beam>
        <beam number="3">begin</beam>
        <notations>
          <slur type="start" number="1"/>
          </notations>
        </note>
      <note default-x="153.33" default-y="0.00">
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>3</duration>
        <voice>1</voice>
        <type>32nd</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        <beam number="2">end</beam>
        <beam number="3">end</beam>
        </note>
      </measure>
    <measure number="308" width="145.67">
      <attributes>
        <time>
          <beats>6</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <note default-x="34.56" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>down</stem>
        <notations>
          <slur type="stop" number="1"/>
          </notations>
        </note>
      <note default-x="75.26" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>96</duration>
        <voice>1</voice>
        <type>whole</type>
        </note>
      </measure>
    <measure number="309" width="0.00">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>7</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="310" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="311" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="312" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="313" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="314" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="315" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="316" width="160.25">
      <attributes>
        <time>
          <beats>7</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="below">
        <direction-type>
          <dynamics default-x="9.90" default-y="-40.00" relative-y="-40.00">
            <f/>
            </dynamics>
          </direction-type>
        <sound dynamics="106.67"/>
        </direction>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-32.82" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>74</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="74"/>
        </direction>
      <note default-x="34.50" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>96</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>whole</type>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      <note default-x="102.95" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>72</duration>
        <tie type="stop"/>
        <tie type="start"/>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <stem>down</stem>
        <notations>
          <tied type="stop"/>
          <tied type="start"/>
          </notations>
        </note>
      </measure>
    <measure number="317" width="91.86">
      <attributes>
        <time>
          <beats>3</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-29.86" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>56</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="56"/>
        </direction>
      <note default-x="34.56" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>72</duration>
        <tie type="stop"/>
        <tie type="start"/>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <stem>down</stem>
        <notations>
          <tied type="stop"/>
          <tied type="start"/>
          </notations>
        </note>
      </measure>
    <measure number="318" width="152.58">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-29.50" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>112</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="112"/>
        </direction>
      <note default-x="34.56" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      <note default-x="63.66" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <slur type="start" number="1"/>
          </notations>
        </note>
      <note default-x="92.77" default-y="-25.00">
        <pitch>
          <step>A</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="121.87" default-y="-40.00">
        <pitch>
          <step>E</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        <notations>
          <slur type="stop" number="1"/>
          </notations>
        </note>
      </measure>
    <measure number="319" width="115.47">
      <note default-x="12.00" default-y="-30.00">
        <pitch>
          <step>G</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="40.75" default-y="-35.00">
        <pitch>
          <step>F</step>
          <octave>4</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>up</stem>
        </note>
      <note default-x="84.77" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      </measure>
    <measure number="320" width="165.92">
      <note default-x="58.20" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      <note default-x="84.73" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        </note>
      <note default-x="111.26" default-y="-25.00">
        <pitch>
          <step>A</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      <note default-x="137.79" default-y="-40.00">
        <pitch>
          <step>E</step>
          <octave>4</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>up</stem>
        </note>
      </measure>
    <measure number="321" width="128.56">
      <note default-x="12.00" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        </note>
      <note default-x="38.53" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">begin</beam>
        </note>
      <note default-x="56.22" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">end</beam>
        </note>
      <note default-x="73.90" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        </note>
      <note default-x="100.43" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="start"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="start"/>
          </notations>
        </note>
      </measure>
    <measure number="322" width="121.06">
      <note default-x="12.00" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <tie type="stop"/>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        <notations>
          <tied type="stop"/>
          </notations>
        </note>
      <note default-x="38.53" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        </note>
      <note default-x="66.40" default-y="-5.00">
        <pitch>
          <step>E</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="92.93" default-y="-15.00">
        <pitch>
          <step>C</step>
          <octave>5</octave>
          </pitch>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="323" width="93.23">
      <note default-x="12.00" default-y="-10.00">
        <pitch>
          <step>D</step>
          <octave>5</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>down</stem>
        </note>
      <note default-x="51.48" default-y="-15.00">
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <accidental>sharp</accidental>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="324" width="93.55">
      <note default-x="12.00" default-y="20.00">
        <pitch>
          <step>C</step>
          <octave>6</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <stem>down</stem>
        </note>
      <note default-x="51.79" default-y="15.00">
        <pitch>
          <step>B</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="325" width="85.82">
      <attributes>
        <time>
          <beats>2</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-39.37" default-y="13.71" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>56</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="56"/>
        </direction>
      <note default-x="44.06" default-y="10.00">
        <pitch>
          <step>A</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="326" width="99.17">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" default-x="-32.82" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>100</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="100"/>
        </direction>
      <note default-x="34.56" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>96</duration>
        <voice>1</voice>
        <type>whole</type>
        </note>
      </measure>
    <measure number="327" width="111.83">
      <attributes>
        <time>
          <beats>6</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <direction placement="above">
        <direction-type>
          <words relative-y="40.00">rit.</words>
          </direction-type>
        </direction>
      <note default-x="58.14" default-y="-10.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="328" width="0.00">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>8</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>90</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="90"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="329" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="330" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="331" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="332" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="333" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="334" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="335" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="336" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <direction>
        <direction-type>
          <words relative-y="40.00">rit.</words>
          </direction-type>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="337" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="338" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>52</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="52"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="339" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="340" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="341" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>10</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>90</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="90"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="342" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="343" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="344" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="345" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="346" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="347" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="348" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="349" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="350" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="351" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="352" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="353" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="354" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="355" width="0.00">
      <attributes>
        <time>
          <beats>12</beats>
          <beat-type>8</beat-type>
          </time>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <beat-unit-dot/>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="276"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="356" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="357" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="358" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="359" width="355.28">
      <direction placement="below">
        <direction-type>
          <dynamics default-x="6.58" default-y="-40.00" relative-y="-40.00">
            <f/>
            </dynamics>
          </direction-type>
        <sound dynamics="106.67"/>
        </direction>
      <direction placement="above">
        <direction-type>
          <words relative-y="40.00">Muted</words>
          </direction-type>
        </direction>
      <note default-x="15.80" default-y="15.00">
        <pitch>
          <step>B</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="55.11" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="75.78" default-y="15.00">
        <pitch>
          <step>B</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="106.79" default-y="10.00">
        <pitch>
          <step>A</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="146.09" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="166.76" default-y="15.00">
        <pitch>
          <step>B</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <note default-x="198.53" default-y="15.00">
        <pitch>
          <step>B</step>
          <octave>5</octave>
          </pitch>
        <duration>36</duration>
        <voice>1</voice>
        <type>quarter</type>
        <dot/>
        <accidental>natural</accidental>
        <stem>down</stem>
        </note>
      <note default-x="257.49" default-y="5.00">
        <pitch>
          <step>G</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>sharp</accidental>
        <stem>down</stem>
        <beam number="1">begin</beam>
        <notations>
          <slur type="start" number="1"/>
          </notations>
        </note>
      <note default-x="288.50" default-y="10.00">
        <pitch>
          <step>A</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        </note>
      <note default-x="322.67" default-y="15.00">
        <pitch>
          <step>B</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        <beam number="1">end</beam>
        <notations>
          <slur type="stop" number="1"/>
          </notations>
        </note>
      </measure>
    <measure number="360" width="336.31">
      <note default-x="58.20" default-y="15.00">
        <pitch>
          <step>B</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="84.74" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="101.83" default-y="10.00">
        <pitch>
          <step>A</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="122.77" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="149.31" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="166.40" default-y="15.00">
        <pitch>
          <step>B</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="198.17" default-y="15.00">
        <pitch>
          <step>B</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <accidental>natural</accidental>
        <stem>down</stem>
        </note>
      <note default-x="224.71" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="239.21" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <note default-x="267.91" default-y="0.00">
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <accidental>sharp</accidental>
        <stem>down</stem>
        </note>
      <note default-x="294.46" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="311.55" default-y="15.00">
        <pitch>
          <step>B</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      </measure>
    <measure number="361" width="152.20">
      <note default-x="12.00" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>72</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="72.08" default-y="-20.00">
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        </note>
      <note default-x="103.49" default-y="-20.00">
        <rest/>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        </note>
      </measure>
    <measure number="362" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="363" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="364" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="365" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>144</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="366" width="210.88">
      <note default-x="12.00" default-y="-20.00">
        <rest/>
        <duration>72</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        </note>
      <note default-x="71.72" default-y="-20.00">
        <rest/>
        <duration>24</duration>
        <voice>1</voice>
        <type>quarter</type>
        </note>
      <note default-x="103.13" default-y="10.00">
        <pitch>
          <step>A</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <note default-x="137.30" default-y="10.00">
        <pitch>
          <step>A</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        <beam number="1">begin</beam>
        </note>
      <note default-x="158.24" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        <beam number="1">continue</beam>
        </note>
      <note default-x="186.11" default-y="5.00">
        <pitch>
          <step>G</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <accidental>flat</accidental>
        <stem>down</stem>
        <beam number="1">end</beam>
        </note>
      </measure>
    <measure number="367" width="299.59">
      <note default-x="12.00" default-y="0.00">
        <pitch>
          <step>F</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="38.54" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="53.04" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <note default-x="84.71" default-y="10.00">
        <pitch>
          <step>A</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="111.25" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="125.75" default-y="20.00">
        <pitch>
          <step>C</step>
          <octave>6</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <note default-x="159.92" default-y="25.00">
        <pitch>
          <step>D</step>
          <alter>-1</alter>
          <octave>6</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="186.46" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="201.07" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="222.01" default-y="-5.00">
        <pitch>
          <step>E</step>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="248.55" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="269.49" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      </measure>
    <measure number="368" width="252.94">
      <note default-x="60.24" default-y="-10.00">
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>72</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <accidental>sharp</accidental>
        <stem>down</stem>
        </note>
      <note default-x="120.63" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="147.89" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="162.50" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="183.55" default-y="-10.00">
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="210.23" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="224.84" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      </measure>
    <measure number="369" width="210.75">
      <note default-x="18.01" default-y="10.00">
        <pitch>
          <step>A</step>
          <alter>-1</alter>
          <octave>5</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <accidental>flat</accidental>
        <stem>down</stem>
        </note>
      <note default-x="44.69" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="59.30" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="80.35" default-y="-20.00">
        <pitch>
          <step>B</step>
          <octave>4</octave>
          </pitch>
        <duration>18</duration>
        <voice>1</voice>
        <type>eighth</type>
        <dot/>
        <stem>down</stem>
        </note>
      <note default-x="107.60" default-y="-20.00">
        <rest/>
        <duration>6</duration>
        <voice>1</voice>
        <type>16th</type>
        </note>
      <note default-x="122.21" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      <note default-x="148.75" default-y="-25.00">
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
          </pitch>
        <duration>72</duration>
        <voice>1</voice>
        <type>half</type>
        <dot/>
        <accidental>sharp</accidental>
        <stem>up</stem>
        </note>
      </measure>
    <measure number="370" width="131.06">
      <attributes>
        <time>
          <beats>3</beats>
          <beat-type>4</beat-type>
          </time>
        </attributes>
      <note default-x="34.56" default-y="5.00">
        <pitch>
          <step>G</step>
          <octave>5</octave>
          </pitch>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        <stem>down</stem>
        </note>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>184</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="184"/>
        </direction>
      <note default-x="55.60" default-y="-20.00">
        <rest/>
        <duration>48</duration>
        <voice>1</voice>
        <type>half</type>
        </note>
      <note default-x="102.96" default-y="-20.00">
        <rest/>
        <duration>12</duration>
        <voice>1</voice>
        <type>eighth</type>
        </note>
      </measure>
    <measure number="371" width="73.63">
      <note default-x="28.52" default-y="-10.00">
        <rest measure="yes"/>
        <duration>72</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="372" width="0.00">
      <attributes>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>23</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="373" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="374" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="375" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="376" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="377" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="378" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="379" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="380" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="381" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="382" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="383" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="384" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="385" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="386" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="387" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="388" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="389" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="390" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="391" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="392" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="393" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="394" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="395" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>11</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="396" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="397" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="398" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="399" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="400" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="401" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="402" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="403" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="404" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="405" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="406" width="0.00">
      <attributes>
        <key>
          <fifths>-2</fifths>
          </key>
        <measure-style>
          <multiple-rest>8</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>96</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="96"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="407" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="408" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="409" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="410" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="411" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="412" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="413" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="414" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="415" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="416" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="417" width="0.00">
      <attributes>
        <time>
          <beats>3</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>4</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>198</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="198"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>72</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="418" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>72</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="419" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>72</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="420" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>72</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="421" width="0.00">
      <attributes>
        <key>
          <fifths>-3</fifths>
          </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
          </time>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="422" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="423" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="424" width="0.00">
      <attributes>
        <key>
          <fifths>-2</fifths>
          </key>
        <measure-style>
          <multiple-rest>3</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="425" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="426" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="427" width="0.00">
      <attributes>
        <key>
          <fifths>1</fifths>
          </key>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="428" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="429" width="0.00">
      <attributes>
        <key>
          <fifths>7</fifths>
          </key>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="430" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="431" width="0.00">
      <attributes>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>80</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="80"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="432" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-light</bar-style>
        </barline>
      </measure>
    <measure number="433" width="0.00">
      <attributes>
        <key>
          <fifths>0</fifths>
          </key>
        <measure-style>
          <multiple-rest>2</multiple-rest>
          </measure-style>
        </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no" relative-y="20.00">
            <beat-unit>quarter</beat-unit>
            <per-minute>76</per-minute>
            </metronome>
          </direction-type>
        <sound tempo="76"/>
        </direction>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="434" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="435" width="232.84">
      <attributes>
        <key>
          <fifths>5</fifths>
          </key>
        </attributes>
      <note default-x="137.61" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="436" width="254.93">
      <attributes>
        <key>
          <fifths>7</fifths>
          </key>
        </attributes>
      <note default-x="159.71" default-y="-10.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="437" width="0.00">
      <attributes>
        <key>
          <fifths>-1</fifths>
          </key>
        <measure-style>
          <multiple-rest>10</multiple-rest>
          </measure-style>
        </attributes>
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="438" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="439" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="440" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="441" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="442" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="443" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="444" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="445" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      </measure>
    <measure number="446" width="0.00">
      <note default-x="0.00" default-y="0.00">
        <rest measure="yes"/>
        <duration>96</duration>
        <voice>1</voice>
        </note>
      <barline location="right">
        <bar-style>light-heavy</bar-style>
        </barline>
      </measure>
    </part>
  </score-partwise>
 `

describe('xml2abcInterpreter', () => {
  it('should return abc string', () => {
    const abcString = xml2abcInterpreter(xmlString);
    expect(abcString).toBe(expectedAbc);
  })
})
