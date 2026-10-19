cmake_minimum_required(VERSION 3.16)
project(EOSecurityNative LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
if(NOT DEFINED CORE OR NOT DEFINED CACHED_NATIVE OR NOT DEFINED CACHED_THIRDPARTY)
 message(FATAL_ERROR "CORE, CACHED_NATIVE and CACHED_THIRDPARTY must be explicit read-only paths")
endif()
add_compile_options(-ffunction-sections -fdata-sections -fvisibility=hidden -fvisibility-inlines-hidden)
add_compile_definitions(_LINUX LINUX _FILE_OFFSET_BITS=64 CSSCALCULATOR_LIBRARY_STATIC CSS_CALCULATOR_WITH_XHTML DISABLE_RUBY_SUPPORT HTMLFILE2_USE_DYNAMIC_LIBRARY MDCONVERTER_DECL_EXPORT MD4C_USE_UTF8 INTVER=9.3.5 _UNICODE UNICODE)
add_executable(security-native main.cpp
 ${CORE}/OfficeUtils/src/zlib_addon.c
 ${CORE}/OfficeUtils/src/ZipUtilsCP.cpp
 ${CORE}/OfficeUtils/src/OfficeUtils.cpp
 ${CORE}/OfficeUtils/src/zlib-1.2.11/contrib/minizip/unzip.c
 ${CORE}/OfficeUtils/src/zlib-1.2.11/contrib/minizip/zip.c
 ${CORE}/OfficeUtils/src/zlib-1.2.11/contrib/minizip/ioapi.c
 ${CORE}/OfficeUtils/src/zlib-1.2.11/contrib/minizip/ioapibuf.c
 ${CORE}/EpubFile/src/CEpubFile.cpp
 ${CORE}/EpubFile/src/CBookToc.cpp
 ${CORE}/EpubFile/src/CBookContentItem.cpp
 ${CORE}/EpubFile/src/CBookItem.cpp
 ${CORE}/EpubFile/src/CBookInfo.cpp)
target_include_directories(security-native PRIVATE ${CACHED_THIRDPARTY} ${CACHED_THIRDPARTY}/boost/include ${CACHED_THIRDPARTY}/md/src ${CORE}/Common/3dParty/html ${CORE}/Common/3dParty/html/css ${CACHED_THIRDPARTY}/html/katana-parser/src ${CACHED_THIRDPARTY}/html/gumbo-parser/src ${CORE}/OfficeUtils/src ${CORE}/OfficeUtils/src/zlib-1.2.11 ${CORE} ${CORE}/EpubFile)
target_link_directories(security-native PRIVATE ${CACHED_NATIVE})
target_link_options(security-native PRIVATE -Wl,--gc-sections)
target_link_libraries(security-native PRIVATE kernel UnicodeConverter graphics kernel_network z)
set_target_properties(security-native PROPERTIES BUILD_RPATH "${CACHED_NATIVE}")

target_sources(security-native PRIVATE
 ${CORE}/HtmlFile2/htmlfile2.cpp
 ${CORE}/HtmlFile2/HTMLReader.cpp
 ${CORE}/HtmlFile2/Table.cpp
 ${CORE}/HtmlFile2/Tags/MDTags.cpp
 ${CORE}/HtmlFile2/Tags/OOXMLTags.cpp
 ${CORE}/HtmlFile2/Writers/MDWriter.cpp
 ${CORE}/HtmlFile2/Writers/OOXMLWriter.cpp
 ${CACHED_THIRDPARTY}/html/katana-parser/src/foundation.c
 ${CACHED_THIRDPARTY}/html/katana-parser/src/katana.lex.c
 ${CACHED_THIRDPARTY}/html/katana-parser/src/katana.tab.c
 ${CACHED_THIRDPARTY}/html/katana-parser/src/parser.c
 ${CACHED_THIRDPARTY}/html/katana-parser/src/selector.c
 ${CACHED_THIRDPARTY}/html/katana-parser/src/tokenizer.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/attribute.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/char_ref.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/error.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/parser.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/string_buffer.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/string_piece.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/tag.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/tokenizer.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/utf8.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/util.c
 ${CACHED_THIRDPARTY}/html/gumbo-parser/src/vector.c
 ${CORE}/Common/3dParty/html/htmltoxhtml.cpp
 ${CORE}/Common/3dParty/html/css/src/CCompiledStyle.cpp
 ${CORE}/Common/3dParty/html/css/src/CCssCalculator_Private.cpp
 ${CORE}/Common/3dParty/html/css/src/CCssCalculator.cpp
 ${CORE}/Common/3dParty/html/css/src/CElement.cpp
 ${CORE}/Common/3dParty/html/css/src/CNode.cpp
 ${CORE}/Common/3dParty/html/css/src/ConstValues.cpp
 ${CORE}/Common/3dParty/html/css/src/CUnitMeasureConverter.cpp
 ${CORE}/Common/3dParty/html/css/src/StaticFunctions.cpp
 ${CORE}/Common/3dParty/html/css/src/StyleProperties.cpp
 ${CORE}/Common/3dParty/html/css/src/xhtml/CDocumentStyle.cpp
 ${CORE}/Common/3dParty/html/css/src/xhtml/CXmlElement.cpp
 ${CORE}/Common/3dParty/md/md2html.cpp
 ${CACHED_THIRDPARTY}/md/src/entity.c
 ${CACHED_THIRDPARTY}/md/src/md4c-html.c
 ${CACHED_THIRDPARTY}/md/src/md4c.c
)
target_link_libraries(security-native PRIVATE ${CACHED_THIRDPARTY}/boost/lib/libboost_filesystem.a ${CACHED_THIRDPARTY}/boost/lib/libboost_system.a ${CACHED_THIRDPARTY}/boost/lib/libboost_regex.a ${CACHED_THIRDPARTY}/boost/lib/libboost_date_time.a ${CACHED_THIRDPARTY}/boost/lib/libboost_atomic.a)

add_executable(xml-wrapper-security xml-wrapper.cpp
 ${CORE}/DesktopEditor/xml/src/xmllight.cpp ${CORE}/DesktopEditor/xml/src/xmldom.cpp
 ${CORE}/DesktopEditor/xml/build/qt/libxml2_all.c ${CORE}/DesktopEditor/xml/build/qt/libxml2_all2.c)
target_include_directories(xml-wrapper-security PRIVATE ${CORE} ${CORE}/DesktopEditor/xml/libxml2
 ${CORE}/DesktopEditor/xml/libxml2/include ${CORE}/DesktopEditor/xml/build/qt)
target_compile_definitions(xml-wrapper-security PRIVATE HAVE_VA_COPY LIBXML_READER_ENABLED
 LIBXML_PUSH_ENABLED LIBXML_HTML_ENABLED LIBXML_XPATH_ENABLED LIBXML_OUTPUT_ENABLED
 LIBXML_C14N_ENABLED LIBXML_SAX1_ENABLED LIBXML_TREE_ENABLED LIBXML_XPTR_ENABLED
 IN_LIBXML LIBXML_STATIC XML_ERROR_DISABLE_MODE)
target_link_directories(xml-wrapper-security PRIVATE ${CACHED_NATIVE})
target_link_libraries(xml-wrapper-security PRIVATE kernel UnicodeConverter m pthread)
set_target_properties(xml-wrapper-security PROPERTIES BUILD_RPATH "${CACHED_NATIVE}")

# Compile the production SVG renderer itself; cached graphics supplies only unchanged dependencies.
file(GLOB SVG_OBJECTS "${CORE}/DesktopEditor/raster/Metafile/svg/SvgObjects/*.cpp")
target_sources(security-native PRIVATE ${SVG_OBJECTS}
 ${CORE}/DesktopEditor/raster/Metafile/svg/CSvgFile.cpp
 ${CORE}/DesktopEditor/raster/Metafile/svg/CSvgParser.cpp
 ${CORE}/DesktopEditor/raster/Metafile/svg/SvgReader.cpp)

target_include_directories(security-native PRIVATE ${CORE}/DesktopEditor/raster/Metafile)

target_include_directories(security-native PRIVATE ${CORE}/DesktopEditor/raster/Metafile/svg)
