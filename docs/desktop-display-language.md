# Desktop display language (0.3.3 candidate)

Choose **File > Options > Language > Display language** to use the system
language or a supported interface language, shown in its own name. Save the
choice; it applies at the next start. **Restart now** saves the Options choices
and uses the existing document close/save decisions and durable write barriers.
Cancel, an unsuccessful document save, or a failed barrier prevents relaunch.

A supported explicit --lang=<locale> startup argument takes precedence for
that run. For example, --lang=en-US selects the English interface on a German
system. Invalid or unsupported arguments are ignored. The order is argument,
saved preference, system preferences, then English. An app-requested restart
drops this temporary language argument so the saved preference takes effect.

The setting changes the interface and its Help language. It does not rewrite
open documents or change their spelling-language metadata. New blank documents
and localized template content keep the system-derived document-language
default independently of the display override. No document/proofing-language
setting is added here. Computer-font consent and AutoRecover remain separate.

Capture mode retains its private profile and explicit capture locales. Its
strict startup parser still rejects additional arguments, including --lang;
capture locale switching is unchanged.

The English fallback keys are in desktop/display-language-strings.cjs.
The five keys are present in all 45 desktop catalogs. The 44 non-English
translations match Z’s approved payload ee397aa0, against English source
f686ae83. Physical Windows/macOS/native
restart acceptance is not inferred from the unit tests.

Evidence: tests/desktop/display-language.test.cjs,
tests/desktop/display-language-main.test.cjs and the Options/capture regression
tests. Actual test results, exact reviewed head and remaining qualification are
recorded in the task checks and bus handoff.
