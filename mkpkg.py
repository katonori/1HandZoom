#!/usr/bin/env python

import sys
import commands
from xml.etree.ElementTree import *

g_FileList = (
"Changelog.txt",
"Changelog.txt",
"LICENSE.txt",
"README.md",
"bootstrap.js",
"chrome.manifest",
"icon.png",
"icon64.png",
"install.rdf",
"locale"
)

def parseRdf():
    tree = None
    try:
        #register_namespace('em', 'http://www.mozilla.org/2004/em-rdf#')
        tree = parse("install.rdf")
    except Exception as e:
        raise e
    elem = tree.getroot()
    ver = elem.find(".//{http://www.mozilla.org/2004/em-rdf#}version").text
    name = elem.find(".//{http://www.mozilla.org/2004/em-rdf#}name").text
    return ver, name

if __name__ == "__main__":
    ver, name = parseRdf()
    fn = "%s-%s.xpi"%(name, ver)
    print("filename: " + fn)
    fileList = " ".join(g_FileList)
    print fileList
    status, out = commands.getstatusoutput('rm -f %s; \
        grep -rE "DEBUG|TEST" . | grep const; \
        zip -r %s %s; \
        cp %s /var/www/html/a.xpi ; \
        cp %s /var/www/html/'%(fn, fn, fileList, fn, fn))
    print status
    print out
