cmake_minimum_required(VERSION 3.16)
project(EOLibxmlSecurity C)
set(CMAKE_C_STANDARD 99)
if(NOT DEFINED XMLROOT OR NOT DEFINED EO_XML_FIXTURE_ROOT)
    message(FATAL_ERROR "XMLROOT and EO_XML_FIXTURE_ROOT must be explicit")
endif()
add_executable(xml-security main.c ${XMLROOT}/build/qt/libxml2_all.c ${XMLROOT}/build/qt/libxml2_all2.c)
target_include_directories(xml-security PRIVATE ${XMLROOT}/libxml2 ${XMLROOT}/libxml2/include ${XMLROOT}/build/qt)
# Match production features; do not enable the test-only VALID module.
target_compile_definitions(xml-security PRIVATE HAVE_VA_COPY LIBXML_READER_ENABLED LIBXML_PUSH_ENABLED
    LIBXML_HTML_ENABLED LIBXML_XPATH_ENABLED LIBXML_OUTPUT_ENABLED LIBXML_C14N_ENABLED
    LIBXML_SAX1_ENABLED LIBXML_TREE_ENABLED LIBXML_XPTR_ENABLED IN_LIBXML LIBXML_STATIC
    XML_ERROR_DISABLE_MODE EO_XML_FIXTURE_ROOT="${EO_XML_FIXTURE_ROOT}")
target_compile_options(xml-security PRIVATE -Werror=incompatible-pointer-types
    -fsanitize=address,undefined -fno-omit-frame-pointer -g -O1)
target_link_options(xml-security PRIVATE -fsanitize=address,undefined)
target_link_libraries(xml-security PRIVATE m pthread)
