/* SPDX-License-Identifier: AGPL-3.0-only */
/* Builder-only compatibility: unsupported close_range returns ENOSYS,
 * allowing GLib to close each descriptor normally. Never ship this preload
 * with the application or report success without closing descriptors. */
#include <errno.h>
int close_range(unsigned int first, unsigned int last, int flags)
{
    if (first > last || (flags & ~6)) {
        errno = EINVAL;
        return -1;
    }
    errno = ENOSYS;
    return -1;
}
