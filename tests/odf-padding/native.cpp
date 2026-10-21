// Synthetic ODF writer padding fixtures; fixed keys/salts are test data only.
#include "OfficeCryptReader/source/CryptTransform.h"
#include "Common/3dParty/cryptopp/zdeflate.h"
#include "Common/3dParty/cryptopp/filters.h"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <iomanip>
#include <vector>
#include <stdexcept>
namespace fs=std::filesystem;
std::string deflate(const std::string& text) {
 std::string result;
 CryptoPP::Deflator compressor(new CryptoPP::StringSink(result),CryptoPP::Deflator::DEFAULT_DEFLATE_LEVEL,CryptoPP::Deflator::DEFAULT_LOG2_WINDOW_SIZE,true);
 compressor.Put2(reinterpret_cast<const CryptoPP::byte*>(text.data()),text.size(),1,true);return result;
}
void write(const fs::path& path,const std::string& data) {
 std::ofstream file(path,std::ios::binary);file.write(data.data(),data.size());if(!file)throw std::runtime_error("fixture write failed");
}
std::string hex(const std::string& bytes) {
 std::ostringstream result;result<<std::hex<<std::setfill('0');for(unsigned char c:bytes)result<<std::setw(2)<<unsigned(c);return result.str();
}
std::string payload(const std::string& label,size_t count) {
 std::string text="<part id=\""+label+"\">";uint32_t state=0x75e3b19u;
 const char alphabet[]="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
 for(size_t i=0;i<count;++i){state=state*1664525u+1013904223u;text.push_back(alphabet[(state>>16)%62]);}
 return text+"</part>";
}
std::string residue_payload(const std::string& label,unsigned residue,size_t start=0) {
 for(size_t n=start;n<start+4096;++n){auto text=payload(label,n);if(deflate(text).size()%16==residue)return text;}
 throw std::runtime_error("residue fixture not found");
}
int main(int argc,char**argv) {
 if(argc!=2)return 2;fs::path out=argv[1];fs::create_directories(out);
 std::ostringstream manifest;manifest<<"[\n";bool first=true;
 auto emit=[&](const std::string& id,const std::string& text,unsigned key_size,bool sha256=true,bool cbc=true) {
  CRYPT::_odfCryptData data;data.cipherAlgorithm=cbc?CRYPT_METHOD::AES_CBC:CRYPT_METHOD::AES_ECB;
  data.start_hashAlgorithm=sha256?CRYPT_METHOD::SHA256:CRYPT_METHOD::SHA1;data.start_hashSize=sha256?32:20;
  data.checksum_hashAlgorithm=sha256?CRYPT_METHOD::SHA256:CRYPT_METHOD::SHA1;
  data.checksum_size=1024;data.keySize=key_size;data.spinCount=1024;
  data.saltValue="synthetic-salt!!";data.saltValue.resize(16,'s');
  data.initializationVector="synthetic-iv!!!!";data.initializationVector.resize(16,'v');
  CRYPT::ODFEncryptor writer;writer.SetCryptData(data);unsigned char* encrypted=nullptr;
  int count=writer.Encrypt(L"synthetic-padding",reinterpret_cast<unsigned char*>(const_cast<char*>(text.data())),static_cast<int>(text.size()),encrypted);
  writer.GetCryptData(data);if(count<0||!encrypted)throw std::runtime_error("encryption failed");
  const auto compressed=deflate(text);
  write(out/(id+".plain"),text);write(out/(id+".deflate"),compressed);
  write(out/(id+".cipher"),std::string(reinterpret_cast<char*>(encrypted),count));delete[]encrypted;
  if(!first)manifest<<",\n";first=false;
  manifest<<"{\"id\":\""<<id<<"\",\"plain_size\":"<<text.size()<<",\"compressed_size\":"<<compressed.size()<<",\"cipher_size\":"<<count
   <<",\"key_size\":"<<key_size<<",\"spin\":1024,\"start_hash\":\""<<(sha256?"sha256":"sha1")
   <<"\",\"checksum_hash\":\""<<(sha256?"sha256":"sha1")<<"\",\"salt\":\""<<hex(data.saltValue)<<"\",\"iv\":\""<<hex(data.initializationVector)
   <<"\",\"checksum\":\""<<hex(data.checksum)<<"\",\"cbc\":"<<(cbc?"true":"false")<<"}";
 };
 for(unsigned residue=0;residue<16;++residue){
  auto text=residue_payload("residue-"+std::to_string(residue),residue);
  emit("sha256-"+std::to_string(residue),text,32,true);emit("sha1-"+std::to_string(residue),text,16,false);
 }
 emit("empty-sha256","",32,true);emit("empty-sha1","",16,false);
 emit("large-aligned",residue_payload("large-aligned",0,4096),32,true);
 emit("large-unaligned",residue_payload("large-unaligned",7,4096),32,true);
 emit("ecb-aligned-control",residue_payload("ecb-control",0),32,true,false);
 for(const auto& format:std::vector<std::string>{"odt","ods","odp"})
  for(unsigned part=0;part<8;++part){const std::string id=format+"-part-"+std::to_string(part);emit(id,residue_payload(id,part),32,true);}
 manifest<<"\n]\n";write(out/"manifest.json",manifest.str());std::cout<<"synthetic_cases=61\n";
}
