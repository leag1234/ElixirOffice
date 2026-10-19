# Overlay project: builds the x2t converter of the DocumentServer core to
# WebAssembly with Emscripten, reusing the core's own CMake files.
# Configure with: emcmake cmake -S tools/wasm/cmake -DEO_CORE_DIR=<core> -DEO_WASM_BOOST=<prefix>
cmake_minimum_required(VERSION 3.20)
project(x2t_wasm C CXX)

if(NOT EMSCRIPTEN)
    message(FATAL_ERROR "This project must be configured with emcmake")
endif()

set(EO_CORE_DIR "" CACHE PATH "DocumentServer core checkout")
set(EO_WASM_BOOST "" CACHE PATH "Boost prefix built for Emscripten (include/, lib/)")
set(EO_WASM_INITIAL_MEMORY "64MB" CACHE STRING "Initial wasm memory")
option(EO_WASM_THREADS "Build with pthreads (needs SharedArrayBuffer, COOP/COEP)" OFF)

# pdf-edit.cpp attests reorderSafe after inspection. Require the reviewed
# original-page lookup before either full or PDF-only runtime can be built.
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    "${EO_CORE_DIR}/PdfFile/PdfEditor.cpp"
    "${CMAKE_CURRENT_LIST_DIR}/../check-pdf-reorder-core.py")
find_package(Python3 REQUIRED COMPONENTS Interpreter)
execute_process(
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_LIST_DIR}/../check-pdf-reorder-core.py" "${EO_CORE_DIR}"
    RESULT_VARIABLE EO_REORDER_GUARD_RESULT
    ERROR_VARIABLE EO_REORDER_GUARD_ERROR)
if(NOT EO_REORDER_GUARD_RESULT STREQUAL "0")
    message(FATAL_ERROR "${EO_REORDER_GUARD_ERROR}")
endif()

set(CORE_ROOT_DIR "${EO_CORE_DIR}")
include("${EO_CORE_DIR}/common.cmake")

# ICU is linked statically from the Emscripten port: nothing to copy.
function(copy_icu_libs artifact)
endfunction()

# --- global flags ---------------------------------------------------------
# C++ exceptions: -fexceptions (emulated in JS, default) or -fwasm-exceptions (native).
set(EO_WASM_EXCEPTIONS "-fexceptions" CACHE STRING "C++ exception model flag")
# ICU comes from the Emscripten port.
set(EO_WASM_COMMON_FLAGS "-sUSE_ICU=1 ${EO_WASM_EXCEPTIONS}")
if(EO_WASM_THREADS)
    string(APPEND EO_WASM_COMMON_FLAGS " -pthread")
endif()
string(APPEND CMAKE_C_FLAGS " ${EO_WASM_COMMON_FLAGS}")
string(APPEND CMAKE_CXX_FLAGS " ${EO_WASM_COMMON_FLAGS}")
add_compile_definitions(__linux__ LINUX _LINUX HAVE_UNISTD_H EO_WASM)

# No rpath in wasm (wasm-ld rejects --disable-new-dtags).
set(CMAKE_SKIP_RPATH ON)

# --- third-party substitutes ------------------------------------------------
set(ICU_INSTALL_DIR_ABS "${CMAKE_CURRENT_BINARY_DIR}/icu-port")   # headers come from the port
file(MAKE_DIRECTORY "${ICU_INSTALL_DIR_ABS}/include")
set(LIBICUUC "-sUSE_ICU=1")
set(LIBICUDATA "")
set(LIBICUI "")

include_directories(SYSTEM "${EO_WASM_BOOST}/include")
foreach(_c system regex)
    add_library(Boost::${_c} INTERFACE IMPORTED GLOBAL)
endforeach()
foreach(_c filesystem date_time)
    add_library(Boost::${_c} STATIC IMPORTED GLOBAL)
    set_target_properties(Boost::${_c} PROPERTIES IMPORTED_LOCATION "${EO_WASM_BOOST}/lib/libboost_${_c}.a")
endforeach()
set(Boost_FOUND TRUE)

set(OPENSSL_LIBSSL "${OPENSSL_WASM_LIBSSL}")
set(OPENSSL_LIBCRYPTO "${OPENSSL_WASM_LIBCRYPTO}")
set(OPENSSL_INSTALL_DIR "${OPENSSL_WASM_INSTALL_DIR_ABS}")
set(OPENSSL_INSTALL_DIR_ABS "${OPENSSL_WASM_INSTALL_DIR_ABS}")

# Components that cannot run in a browser are replaced by stubs:
#  - doctrenderer embeds V8 (JS engine) and is only used for JS-driven
#    conversions (PDF/image rendering of the editor format, macros, docbuilder);
#  - kernel_network wraps curl (remote downloads).
add_subdirectory("${CMAKE_CURRENT_LIST_DIR}/../stubs" stubs)

add_subdirectory("${EO_CORE_DIR}/X2tConverter/build/cmake" x2t)

# --- the x2t module ----------------------------------------------------------
# x2t.js + x2t.wasm, an ES-agnostic factory `createX2t()`; the caller writes
# the input and the task XML into the in-memory file system (FS) and runs
# callMain(["/task.xml"]). Nothing touches the network or the real disk.
set(EO_WASM_LINK_FLAGS
    -sMODULARIZE=1
    -sEXPORT_NAME=createX2t
    -sINVOKE_RUN=0
    -sEXIT_RUNTIME=0
    -sEXPORTED_RUNTIME_METHODS=FS,callMain,HEAPU8
    --emit-symbol-map
    -sALLOW_MEMORY_GROWTH=1
    -sINITIAL_MEMORY=${EO_WASM_INITIAL_MEMORY}
    -sMAXIMUM_MEMORY=4GB
    -sSTACK_SIZE=8MB
    -sENVIRONMENT=web,worker,node
    -sERROR_ON_UNDEFINED_SYMBOLS=0
    -sUSE_ICU=1
    ${EO_WASM_EXCEPTIONS}
    ${EO_WASM_EXTRA_LINK_FLAGS}
)
if(EO_WASM_THREADS)
    list(APPEND EO_WASM_LINK_FLAGS -pthread -sPTHREAD_POOL_SIZE=4)
endif()
# common.cmake adds an ELF-only linker flag that wasm-ld rejects.
get_target_property(_x2t_lo x2t LINK_OPTIONS)
list(REMOVE_ITEM _x2t_lo "-Wl,--disable-new-dtags")
set_property(TARGET x2t PROPERTY LINK_OPTIONS ${_x2t_lo})
target_link_options(x2t PRIVATE ${EO_WASM_LINK_FLAGS})
set_target_properties(x2t PROPERTIES SUFFIX ".js" SKIP_BUILD_RPATH TRUE BUILD_RPATH "" INSTALL_RPATH "")

# One static module = one definition per class. Natively, graphics and
# HtmlFile2 are separate shared objects and each keeps its own copy of the CSS
# calculator, built with and without CSS_CALCULATOR_WITH_XHTML (different class
# layouts). Linked together, the linker keeps one copy and the other library
# corrupts memory (crash in the SVG/EMF path). Build both the same way.
target_compile_definitions(graphics PRIVATE CSS_CALCULATOR_WITH_XHTML)
# Generated PDF provenance names this product; existing document Creator is retained.
target_compile_definitions(PdfFile PRIVATE "APPLICATION_NAME_DEFAULT=\"ElixirOffice\"")

# PDF-only executable: the same PdfFile renderer, without x2t's Office converters.
# Static linking still retains PdfFile's reader-facing vtable dependencies.
add_executable(pdf_runtime pdf-main.cpp pdf-edit.cpp)
target_include_directories(pdf_runtime PRIVATE "${EO_CORE_DIR}"
    "${EO_CORE_DIR}/PdfFile/lib" "${EO_CORE_DIR}/PdfFile/lib/goo"
    "${EO_CORE_DIR}/PdfFile/lib/fofi" "${EO_CORE_DIR}/PdfFile/lib/splash")
target_link_libraries(pdf_runtime PRIVATE PdfFile HtmlFile2)
target_link_options(pdf_runtime PRIVATE ${EO_WASM_LINK_FLAGS})
set_target_properties(pdf_runtime PROPERTIES OUTPUT_NAME x2t SUFFIX ".js"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/pdf-runtime")
