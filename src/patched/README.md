# Patched Modules
In this directory, these are patched modules (include CSS).
It is recommend to create issue to original module for long-term development but this is the temporary solution to deal with bugs, especially for modules that still in development but resolved ones are not production ready.

## tocas.css
This is a patched TocasUI css that changed `*` selector into `body` as that cause conflict with Monaco Editor.
Also wired back all resource files as the path is different from original one.