# Header-only stand-ins for core libraries that have no browser equivalent.
# Their symbols stay unresolved at link time (ERROR_ON_UNDEFINED_SYMBOLS=0):
# reaching them at run time aborts the conversion with a clear error code.
add_library(doctrenderer INTERFACE)
add_library(kernel_network INTERFACE)
