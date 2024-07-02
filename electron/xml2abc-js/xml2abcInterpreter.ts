const xml2abc = require('./xml2abc.js')
const $ = require('jquery');

/**
 * Takes in MusicXML text and returns an ABC string for OpenMarch
 */
export default function xml2abcInterpreter(xml: string): string {
    var xmldata = $.parseXML(xml);    // abc_code is a (unicode) string with one abc tune.

    // the options are passed as a single object, where the members have the same name and value(s)
    // as in xml2abc.py. Consult the readme of xml2abc.py for more information on these options.
    // Here we just use the defaults by setting them to zero.

    var options = {
        u: 0, b: 0, n: 0,  // unfold repeats (1), bars per line, chars per line
        c: 0, v: 0, d: 0,  // credit text filter level (0-6), no volta on higher voice numbers (1), denominator unit length (L:)
        m: 0, x: 0, t: 0,  // no midi, minimal midi, all midi output (0,1,2), no line breaks (1), perc, tab staff -> voicemap (1)
        v1: 0, noped: 0,  // all directions to first voice of staff (1), no pedal directions (1)
        stm: 0,          // translate stem elements (stem direction)
        p: 'f', s: 0
    };   // page format: scale (1.0), width, left- and right margin in cm, shift note heads in tablature (1)

    var result = xml2abc.vertaal(xmldata, options);
    var abcText = result[0];               // the translation (string)
    var errorTxt = result[1];              // all information and error messages (string)

    if (errorTxt.length > 0) {
        console.error(errorTxt);
    }

    return abcText;
}

