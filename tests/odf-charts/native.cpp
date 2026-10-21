// Synthetic-only regression driver for the production ODF chart reader and writer.
#include "OdfFile/Writer/Format/ods_conversion_context.h"
#include "OdfFile/Writer/Format/office_chart.h"
#include "OdfFile/Reader/Format/chart_build_oox.h"
#include "OdfFile/Reader/Format/paragraph_elements.h"
#include <iostream>
#include <cmath>
#include "OdfFile/Reader/Converter/oox_chart_context.h"
#include "OdfFile/Reader/Converter/oox_chart_series.h"
#include <cstdlib>
#include "OdfFile/Reader/Format/odf_document.h"
#include "OdfFile/Reader/Format/odf_document_impl.h"
#include "OdfFile/Writer/Converter/Converter.h"
#include "OOXML/XlsxFormat/Chart/ChartSerialize.h"
using namespace cpdoccore;
namespace reader = cpdoccore::odf_reader;
namespace writer = cpdoccore::odf_writer;

template<class T> auto resolve(T& c, const std::wstring& address, reader::office_element* root,
    std::vector<std::wstring>& values, int)
    -> decltype(c.calc_cache_series(address, values, root), void())
{ c.calc_cache_series(address, values, root); }
// Allows the identical behavioral regression to run against the unchanged baseline.
template<class T> void resolve(T& c, const std::wstring& address, reader::office_element*,
    std::vector<std::wstring>& values, long) { c.calc_cache_series(address, values); }
template<class T> auto cache(T& c, std::vector<std::wstring>& values, bool strings, int)
    -> decltype(c.set_cash(L"General", values, false, false, strings), void())
{ c.set_cash(L"General", values, false, false, strings); }
template<class T> void cache(T& c, std::vector<std::wstring>& values, bool, long)
{ c.set_cash(L"General", values, false, false); }

class ChartConverter : public Oox2Odf::OoxConverter
{
public:
    explicit ChartConverter(writer::ods_conversion_context& c):context(c){}
    bool convertDocument() override {return false;}
    OOX::IFileContainer* current_document() override {return nullptr;}
    writer::odf_conversion_context* odf_context() override {return &context;}
    PPTX::Theme* oox_theme() override {return nullptr;}
    std::wstring find_link_by_id(const std::wstring&,int,bool&) override {return L"";}
    NSCommon::smart_ptr<OOX::File> find_file_by_id(const std::wstring&) override {return {};}
private:
    writer::ods_conversion_context& context;
};
reader::office_element_ptr cell(const std::wstring& value, char kind='n', unsigned repeat=1)
{
    auto element=reader::office_element_ptr(new reader::table_table_cell());
    auto* c=dynamic_cast<reader::table_table_cell*>(element.get());
    c->attlist_.table_number_columns_repeated_=repeat;
    auto& a=c->attlist_.common_value_and_type_attlist_;
    if(kind=='n') a.office_value_=value;
    if(kind=='s') a.office_string_value_=value;
    if(kind=='d') a.office_date_value_=value;
    if(kind=='t') a.office_time_value_=value;
    if(kind=='b') a.office_boolean_value_=value;
    return element;
}
reader::office_element_ptr row(std::vector<reader::office_element_ptr> cells, unsigned repeat=1)
{
    auto element=reader::office_element_ptr(new reader::table_table_row());
    auto* r=dynamic_cast<reader::table_table_row*>(element.get());
    r->attlist_.table_number_rows_repeated_=repeat;
    r->content_=cells; return element;
}
void table(reader::office_spreadsheet& root, const std::wstring& name,
           std::vector<reader::office_element_ptr> rows)
{
    auto element=reader::office_element_ptr(new reader::table_table());
    auto* t=dynamic_cast<reader::table_table*>(element.get());
    t->attlist_.table_name_=name;
    auto r=reader::office_element_ptr(new reader::table_table_rows());
    dynamic_cast<reader::table_table_rows*>(r.get())->content_=rows;
    t->table_rows_and_groups_.content_.push_back(r);
    root.content_.push_back(element);
}
int reader_tests()
{
    reader::office_spreadsheet root;
    table(root,L"First",{row({cell(L"1")}),row({cell(L"2")}),row({cell(L"3")})});
    table(root,L"Second",{row({cell(L"11")}),row({cell(L"12")}),row({cell(L"13")})});
    table(root,L"Quarter.'s data",{row({cell(L"21")}),row({cell(L"22")})});
    table(root,L"Types",{row({cell(L"2024-01-01",'d'),cell(L"PT12H00M00S",'t'),
        cell(L"true",'b'),cell(L"001",'s'),cell(L"3.25")})});
    table(root,L"Sparse",{row({cell(L"4"),cell(L"",'x'),cell(L"9")})});
    table(root,L"Repeated",{row({cell(L"7",'n',16384)},1048576)});
    reader::object_odf_context c(L"");
    int failures=0, cases=0;
    auto check=[&](const char* name,const std::wstring& ref,
                   const std::vector<std::wstring>& expected,bool numeric=false) {
        std::vector<std::wstring> got;resolve(c,ref,&root,got,0);
        bool pass=got==expected;
        if(numeric && got.size()==expected.size()) {
            pass=true;
            for(size_t i=0;i<got.size();++i) {
                try { if(std::abs(std::stod(got[i])-std::stod(expected[i]))>1e-9) pass=false; }
                catch(...) {pass=false;}
            }
        }
        std::cout<<name<<" "<<(pass?"PASS":"FAIL")<<" "<<got.size()<<"\n";
        ++cases;if(!pass)++failures;
    };
    check("bound-root",L"First.A1:.A3",{L"1",L"2",L"3"});
    check("sheet-identity",L"Second.A1:.A3",{L"11",L"12",L"13"});
    check("quoted-sheet",L"$'Quarter.''s data'.$A$1:.$A$2",{L"21",L"22"});
    check("typed-numeric",L"Types.A1:.C1",{L"45292",L"0.5",L"1"},true);
    check("typed-string",L"Types.D1",{L"001"});
    check("stored-number",L"Types.E1",{L"3.25"});
    check("sparse-indices",L"Sparse.A1:.C1",{L"4",L"",L"9"});
    check("bounded-repeat-intersection",L"Repeated.XFB1048576:.XFD1048576",{L"7",L"7",L"7"});
    check("missing-sheet",L"Absent.A1:.A3",{});
    // Editing worksheet data must keep the address and expose updated points.
    auto* t=dynamic_cast<reader::table_table*>(root.content_[0].get());
    auto* rs=dynamic_cast<reader::table_table_rows*>(t->table_rows_and_groups_.content_[0].get());
    auto* r=dynamic_cast<reader::table_table_row*>(rs->content_[1].get());
    dynamic_cast<reader::table_table_cell*>(r->content_[0].get())->attlist_.common_value_and_type_attlist_.office_value_=L"42";
    check("edited-root-range",L"First.A1:.A3",{L"1",L"42",L"3"});
    c.table_name_=L"local-table";
    c.cash_values={{0,0,L"81"},{0,1,L"82"},{0,2,L"83"},
                   {1,0,L"91"},{1,1,L"92"},{1,2,L"93"}};
    check("embedded-cache-precedence",L"local-table.A1:.A3",{L"81",L"82",L"83"});
    check("embedded-other-sheet-fallback",L"Second.A1:.A3",{L"11",L"12",L"13"});
    c.cash_pivot[L"First.A1:.A3"]={1,0,L"91"};
    check("mapped-bound-cache",L"First.A1:.A3",{L"91",L"92",L"93"});
    // Legacy ambiguity: an identical worksheet/cache name without a descriptor uses the embedded cache.
    table(root,L"local-table",{row({cell(L"1")}),row({cell(L"2")}),row({cell(L"3")})});
    check("legacy-cache-name-shadow",L"local-table.A1:.A3",{L"81",L"82",L"83"});
    c.bPivotChart_=true;c.cash_pivot[L"pivot-source"]={0,0,L""};
    check("pivot-cache-positive",L"pivot-source",{L"82",L"83"});
    c.bPivotChart_=false;
    reader::office_document_content document;
    auto body=reader::office_element_ptr(new reader::office_body());
    auto copied=reader::office_element_ptr(new reader::office_spreadsheet());
    dynamic_cast<reader::office_spreadsheet*>(copied.get())->content_=root.content_;
    dynamic_cast<reader::office_body*>(body.get())->content_=copied;
    document.office_body_=body;
    reader::object_odf_context wrapped(L"");std::vector<std::wstring> wrapped_values;
    resolve(wrapped,L"First.A1:.A3",&document,wrapped_values,0);
    bool wrapped_pass=wrapped_values==std::vector<std::wstring>{L"1",L"42",L"3"};
    ++cases;if(!wrapped_pass)++failures;
    std::cout<<"document-body-root "<<(wrapped_pass?"PASS":"FAIL")<<" "<<wrapped_values.size()<<"\n";
    std::cout<<"total "<<cases<<" failures "<<failures<<"\n";
    return failures?1:0;
}
int writer_case(const std::string& mode)
{
    writer::package::odf_document out(L"spreadsheet",false);
    writer::ods_conversion_context context(&out);
    context.start_document();context.start_drawing_context();context.start_sheet();context.start_chart();
    ChartConverter converter(context);
    auto* c=context.chart_context();
    const auto kind=mode=="reserved-bubble"?odf_types::chart_class::bubble:mode=="scatter"||mode=="reserved-scatter"?odf_types::chart_class::scatter:odf_types::chart_class::bar;
    c->set_chart_type(kind);
    auto provide_table=[&]() {
        writer::office_element_ptr existing,row,cell,style,column;
        writer::create_element(L"table",L"table",existing,&context);
        writer::ods_table_state state(&context,existing);state.set_table_name(L"provided-cache");
        writer::create_element(L"table",L"table-column",column,&context);existing->add_child_element(column);
        writer::create_element(L"table",L"table-row",row,&context);state.add_row(row,1,style);
        writer::create_element(L"table",L"table-cell",cell,&context);state.start_cell(cell,style);
        state.set_cell_value(L"99",true);state.end_cell();
        c->set_local_table(existing);
    };
    c->start_plot_area();
    if(mode=="provided-before")provide_table();
    c->start_axis();c->set_axis_dimension(1);c->end_element();c->start_group_series();
    auto series=[&](const std::wstring& formula,std::vector<std::wstring> values,bool strings=false) {
        c->start_series(kind);
        c->set_series_value_formula(formula,L"General");
        if(strings) {
            OOX::Spreadsheet::CT_StrData data;data.m_ptCount=static_cast<unsigned>(values.size());
            for(size_t i=0;i<values.size();++i) {
                auto* point=new OOX::Spreadsheet::CT_StrVal();point->m_idx=static_cast<unsigned>(i);
                point->m_v=values[i];data.m_pt.push_back(point);
            }
            converter.convert(&data,false,false);
        } else cache(*c,values,false,0);
        if((mode=="strings" || mode=="strings-sparse" || mode=="scatter") && formula.find(L"First!") == 0) {
            c->set_category_axis_formula(mode=="strings-sparse"?L"'Quarter.''s data'!$B$1:$B$4":L"'Quarter.''s data'!$B$1:$B$3",L"General",mode=="scatter"?2:1);
            if(mode=="strings" || mode=="strings-sparse") {
                OOX::Spreadsheet::CT_StrData data;data.m_ptCount=mode=="strings-sparse"?4u:3u;
                const std::vector<unsigned> indices=mode=="strings-sparse"?std::vector<unsigned>{2,0}:std::vector<unsigned>{0,1,2};
                for(unsigned i:indices) {
                    auto* point=new OOX::Spreadsheet::CT_StrVal();point->m_idx=i;
                    point->m_v=std::vector<std::wstring>{L"001",L"A&B",L"<three>"}[i];
                    data.m_pt.push_back(point);
                }
                converter.convert(&data,true,false);
            } else {
                OOX::Spreadsheet::CT_NumData data;data.m_ptCount=3u;data.m_formatCode=L"General";
                for(unsigned i=0;i<3;++i) {
                    auto* point=new OOX::Spreadsheet::CT_NumVal();point->m_idx=i;
                    point->m_v=std::to_wstring(101+i);data.m_pt.push_back(point);
                }
                converter.convert(&data,true,false);
            }
        }
        if((mode=="reserved-scatter"||mode=="reserved-bubble")&&formula.find(L"local-table!")==0){
            c->set_category_axis_formula(L"",L"General",2);
            std::vector<std::wstring> x={L"101",L"102",L"103"};c->set_cash(L"General",x,true,false);
        }
        c->end_series();
    };
    if(mode=="literal-first" || mode=="reserved-literal-first") series(L"",{L"31",L"32",L"33"});
    series(mode=="reserved-case"?L"Local-Table!$A$1:$A$3":mode=="reserved-relative"?L"local-table!A1:A3":mode.find("reserved")==0?L"local-table!$A$1:$A$3":L"First!$A$1:$A$3",{L"1",L"2",L"3"});
    series(L"Second!$A$1:$A$3",{L"11",L"12",L"13"});
    if(mode=="bound-first" || mode=="reserved-bound-first" || mode=="reserved-relative" || mode=="reserved-case") series(L"",{L"31",L"32",L"33"});
    if(mode=="sparse") series(L"First!$C$1:$C$3",{L"4",L"",L"9"});
    if(mode=="sparse-idx") {
        c->start_series(kind);
        c->set_series_value_formula(L"First!$C$1:$C$3",L"General");
        OOX::Spreadsheet::CT_NumData data;data.m_ptCount=3u;data.m_formatCode=L"General";
        for(unsigned i : {2u,0u}) {
            auto* point=new OOX::Spreadsheet::CT_NumVal();point->m_idx=i;
            point->m_v=i?L"9":L"4";data.m_pt.push_back(point);
        }
        converter.convert(&data,false,false);c->end_series();
    }
    if(mode=="provided-after")provide_table();
    c->end_group_series();c->end_plot_area();c->end_chart();
    context.get_current_object_element()->serialize(std::wcout);
    return 0;
}
int parsed_cache(const std::string& folder,const std::string& address)
{
    const std::string temp=std::getenv("TMPDIR")?std::getenv("TMPDIR"):"/tmp";
    reader::odf_document document(std::wstring(folder.begin(),folder.end()),std::wstring(temp.begin(),temp.end()),L"");
    auto* content=document.get_impl()->get_content();
    if(!content) return 2;
    reader::object_odf_context context(L"");
    reader::process_build_object build(context,&document);
    content->accept(build);
    if(address=="__mapping__") {
        const size_t high=2147483647u;
        const bool pass=context.current_table_row_==static_cast<int>(high)&&context.columns_count_==4294967295u&&context.cash_values.size()==4&&context.cash_values[1].col==high&&context.cash_values[2].col==high&&context.cash_values[3].row==high;
        std::cout<<"mapping "<<(pass?"PASS":"FAIL")<<" rows "<<context.current_table_row_<<" columns "<<context.columns_count_<<"\n";return pass?0:1;
    }
    std::vector<std::wstring> values;
    resolve(context,std::wstring(address.begin(),address.end()),nullptr,values,0);
    for(const auto& value:values) std::wcout<<L"point\t"<<value<<L"\n";
    return 0;
}
int formula_case(const std::string& mode)
{
    const std::wstring sheet=mode=="formula-prefix"?L"local-table-report":mode=="formula-ordinary"?L"Ordinary":L"local-table";
    const bool bound=mode!="formula-literal";
    reader::object_odf_context c(L"");c.class_=odf_types::chart_class::bar;c.table_name_=L"local-table";
    const std::wstring value=sheet+L".A1:"+sheet+L".A3",label=sheet+L".B1",category=sheet+L".C1:"+sheet+L".C3";
    c.add_series(value,label,odf_types::chart_class::bar,L"",L"");c.categories_.push_back(category);
    c.cash_values={{0,0,L"1"},{0,1,L"2"},{0,2,L"3"},{1,0,L"label"},{2,0,L"a"},{2,1,L"b"},{2,2,L"c"}};
    if(bound){c.cash_pivot[value]={0,0,L""};c.cash_pivot[label]={1,0,L""};c.cash_pivot[category]={2,0,L""};}
    oox::mediaitems_ptr media;oox::oox_chart_context chart(media,L"");
    chart.no_used_local_tables_=true;c.oox_convert(chart);chart.serialize(std::wcout);
    return 0;
}

int limit_case(const std::string& mode)
{
    if(mode.find("limit-root-")==0 || mode.find("limit-mapped-")==0) {
        reader::office_spreadsheet root;
        table(root,L"Repeated",{row({cell(L"7",'n',4294967295u)},4294967295u)});
        const bool small=mode=="limit-root-repeat";
        const bool boundary=mode=="limit-root-boundary";
        const bool all=mode.find("-all")!=std::string::npos;
        const std::wstring ref=small?L"Repeated.XFB1048576:.XFD1048576":all?
            L"Repeated.A1:.XFD1048576":boundary?L"Repeated.A1:.A1000000":L"Repeated.A1:.A1000001";
        reader::object_odf_context c(L"");std::vector<std::wstring> values;
        if(mode.find("limit-mapped-")==0)c.cash_pivot[ref]={0,0,L""};
        resolve(c,ref,&root,values,0);
        const size_t expected=small?3:boundary?1000000:0;
        const bool pass=values.size()==expected && (!expected || (values.front()==L"7"&&values.back()==L"7"));
        std::cout<<"limit "<<(pass?"PASS":"FAIL")<<" points "<<values.size()<<"\n";return pass?0:1;
    }
    writer::package::odf_document out(L"spreadsheet",false);
    writer::ods_conversion_context context(&out);context.start_document();context.start_drawing_context();context.start_sheet();context.start_chart();
    ChartConverter converter(context);auto*c=context.chart_context();const auto kind=odf_types::chart_class::bar;
    c->set_chart_type(kind);c->start_plot_area();c->start_group_series();c->start_series(kind);c->set_series_value_formula(L"First!A1:A3",L"General");
    const bool count=mode.find("-count")!=std::string::npos;
    if(mode.find("limit-str-")==0) {
        OOX::Spreadsheet::CT_StrData data;data.m_ptCount=count?4294967295u:1u;
        auto*p=new OOX::Spreadsheet::CT_StrVal();p->m_idx=count?0u:4294967295u;p->m_v=L"one";data.m_pt.push_back(p);converter.convert(&data,false,false);
    } else {
        OOX::Spreadsheet::CT_NumData data;data.m_ptCount=count?4294967295u:1u;
        auto*p=new OOX::Spreadsheet::CT_NumVal();p->m_idx=count?0u:4294967295u;p->m_v=L"1";data.m_pt.push_back(p);converter.convert(&data,false,false);
    }
    c->end_series();c->end_group_series();c->end_plot_area();c->end_chart();context.get_current_object_element()->serialize(std::wcout);return 0;
}


int writer_budget_case(const std::string& mode)
{
    writer::package::odf_document out(L"spreadsheet",false);
    writer::ods_conversion_context context(&out);
    context.start_document();context.start_drawing_context();context.start_sheet();context.start_chart();
    ChartConverter converter(context);auto*c=context.chart_context();const auto kind=odf_types::chart_class::bar;
    auto start=[&](){c->set_chart_type(kind);c->start_plot_area();c->start_axis();c->set_axis_dimension(1);c->end_element();c->start_group_series();};
    auto numeric=[&](unsigned count,unsigned index=0){
        OOX::Spreadsheet::CT_NumData d;d.m_ptCount=count;
        auto*p=new OOX::Spreadsheet::CT_NumVal();p->m_idx=index;p->m_v=L"7";d.m_pt.push_back(p);converter.convert(&d,false,false);
    };
    auto text=[&](unsigned count,bool categories,bool label){
        OOX::Spreadsheet::CT_StrData d;d.m_ptCount=count;
        auto*p=new OOX::Spreadsheet::CT_StrVal();p->m_idx=0u;p->m_v=L"text";d.m_pt.push_back(p);converter.convert(&d,categories,label);
    };
    start();
    if(mode=="writer-budget-num"||mode=="writer-budget-str"||mode=="writer-budget-direct"){
        std::vector<std::wstring> direct;if(mode=="writer-budget-direct")direct.resize(600000,L"7");
        for(unsigned i=0;i<64;++i){
            c->start_series(kind);c->set_series_value_formula(L"",L"General");
            if(mode=="writer-budget-num")numeric(600000);
            else if(mode=="writer-budget-str")text(600000,false,false);
            else{cache(*c,direct,false,0);if(direct.size()!=600000||direct.front()!=L"7")return 3;}
            c->end_series();
        }
    }else if(mode=="writer-budget-roles"){
        for(unsigned i=0;i<4;++i){
            c->start_series(kind);c->set_series_value_formula(L"",L"General");numeric(200000);
            if(i==0){
                c->set_series_label_formula(L"Root!$B$1:$B$200000");text(200000,false,true);
                c->set_category_axis_formula(L"Root!$C$1:$C$200000",L"General",1);text(200000,true,false);
            }
            c->end_series();
        }
    }else if(mode=="writer-budget-reset"){
        c->start_series(kind);c->set_series_value_formula(L"Root!A1:A3",L"General");numeric(600000);c->end_series();
        writer::office_element_ptr table,col,row,cell,style;
        writer::create_element(L"table",L"table",table,&context);writer::ods_table_state state(&context,table);state.set_table_name(L"local-table");
        writer::create_element(L"table",L"table-column",col,&context);table->add_child_element(col);
        writer::create_element(L"table",L"table-row",row,&context);state.add_row(row,1,style);
        writer::create_element(L"table",L"table-cell",cell,&context);state.start_cell(cell,style);state.set_cell_value(L"99",true);state.end_cell();
        c->set_local_table(table);c->end_group_series();c->end_plot_area();c->end_chart();
        context.start_chart();c=context.chart_context();start();c->start_series(kind);c->set_series_value_formula(L"",L"General");numeric(600000);c->end_series();
    }else if(mode=="writer-reject-bound-name"){
        c->start_series(kind);c->set_series_value_formula(L"",L"General");numeric(3);c->end_series();
        c->start_series(kind);c->set_series_value_formula(L"'local-table'!A1:A3",L"General");numeric(1000001);c->end_series();
        c->end_group_series();c->end_plot_area();c->end_chart();
    }else if(mode.find("writer-reject-")==0){
        c->set_local_table(true);c->start_series(kind);c->set_series_value_formula(L"Root!A1:A3",L"General");
        if(mode=="writer-reject-values")numeric(1000001);
        else{
            numeric(3);
            if(mode=="writer-reject-label"){c->set_series_label_formula(L"Root!B1");text(1000001,false,true);}
            else{c->set_category_axis_formula(L"Root!C1:C3",L"General",mode=="writer-reject-domain"?2:1);text(1000001,true,false);}
        }
        c->end_series();c->end_group_series();c->end_plot_area();c->end_chart();
    }else{
        const bool strings=mode.find("-str-")!=std::string::npos,indexed=mode.find("index")!=std::string::npos;
        const bool over=mode.find("-over")!=std::string::npos;
        const unsigned count=indexed?0u:over?1000001u:1000000u,index=indexed?(over?1000000u:999999u):0u;
        c->start_series(kind);c->set_series_value_formula(L"",L"General");
        if(strings){
            OOX::Spreadsheet::CT_StrData d;d.m_ptCount=count;auto*p=new OOX::Spreadsheet::CT_StrVal();p->m_idx=index;p->m_v=L"seven";d.m_pt.push_back(p);converter.convert(&d,false,false);
        }else numeric(count,index);
        c->end_series();
    }
    // Admission controls intentionally inspect the real retained chart metadata
    // before million-cell table materialization. Rejection cases above finalize.
    context.get_current_object_element()->serialize(std::wcout);return 0;
}
int reader_budget_case(const std::string& mode)
{
    if(mode=="reader-budget-pivot"){
        reader::object_odf_context c(L"");c.bPivotChart_=true;
        c.cash_pivot[L"pivot"]={1,0,L""};c.cash_values={{1,1,L"1"},{1,2,L"2"}};
        chart_cache::budget allowance;allowance.consume(chart_cache::max_points-1);
        std::vector<std::wstring> values;c.calc_cache_series(L"pivot",values,nullptr,allowance);
        const bool pass=values.empty();std::cout<<"reader-budget "<<(pass?"PASS":"FAIL")<<" points "<<values.size()<<"\n";return pass?0:1;
    }
    const bool shared=mode.find("reader-budget-shared-")==0;
    const bool roles=mode=="reader-budget-roles";reader::office_spreadsheet root;
    table(root,L"Repeated",{row({cell(L"7",'n',4)},1000000)});
    reader::object_odf_context c(L"");c.class_=roles||shared?odf_types::chart_class::scatter:odf_types::chart_class::bar;
    const unsigned shared_count=mode=="reader-budget-shared-within"?5000u:10000u;
    const std::wstring suffix=std::to_wstring(shared_count);
    const std::wstring cells=shared?L"Repeated.B1:.B"+suffix:roles?L"Repeated.B1:.B200000":L"Repeated.A1:.A600000";
    if(shared){c.domain_cell_range_adress_=L"Repeated.A1:.A"+suffix;c.categories_.push_back(L"Repeated.D1:.D"+suffix);}
    if(roles){c.domain_cell_range_adress_=L"Repeated.A1:.A200000";c.categories_.push_back(L"Repeated.D1:.D200000");}
    for(unsigned i=0;i<(shared?50u:roles?2u:64u);++i)c.add_series(cells,roles?L"Repeated.C1:.C200000":L"",c.class_,L"",L"");
    oox::mediaitems_ptr media;oox::oox_chart_context chart(media,L"");c.oox_convert(chart,&root);
    const auto graph=chart.get_current_chart();if(!graph)return 2;size_t total=0;
    for(const auto&s:graph->series_){
        total+=s->label_.str_cache.size();
        for(const auto&v:s->values_)total+=v.numRef_.num_cache.size()+v.strRef_.str_cache.size();
    }
    const size_t expected=shared?(shared_count==5000?750000:1000000):roles?1000000:600000;
    std::cout<<"reader-budget "<<(total==expected?"PASS":"FAIL")<<" points "<<total<<"\n";return total==expected?0:1;
}

int main(int argc,char**argv)
{
    const std::string mode=argc>1?argv[1]:"bound";
    if(mode.find("writer-budget-")==0||mode.find("writer-boundary-")==0||mode.find("writer-reject-")==0)return writer_budget_case(mode);
    if(mode.find("reader-budget-")==0)return reader_budget_case(mode);
    if(mode.find("limit-")==0)return limit_case(mode);
    if(mode.find("formula-")==0)return formula_case(mode);
    if(mode=="parsed") return argc==4?parsed_cache(argv[2],argv[3]):2;
    return mode=="reader"?reader_tests():writer_case(mode);
}
