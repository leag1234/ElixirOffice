// SPDX-License-Identifier: AGPL-3.0-only
#include <libxml/xmlversion.h>
#ifdef EXPECT_NO_NETWORK
#if defined(LIBXML_HTTP_ENABLED) || defined(LIBXML_FTP_ENABLED)
#error Wasm libxml must not compile HTTP or FTP support
#endif
#else
#if !defined(LIBXML_HTTP_ENABLED) || !defined(LIBXML_FTP_ENABLED)
#error Native forced-feature control must activate both definitions
#endif
#endif
int main(void) { return 0; }
