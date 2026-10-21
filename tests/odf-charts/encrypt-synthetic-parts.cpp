// Synthetic interoperability fixture helper; links the writer independently.
#include "OfficeCryptReader/source/CryptTransform.h"
#include "Common/3dParty/cryptopp/zdeflate.h"
#include "Common/3dParty/cryptopp/filters.h"
#include "Common/3dParty/cryptopp/osrng.h"
#include <filesystem>
#include <stdexcept>
#include <iterator>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <iostream>
namespace fs=std::filesystem;
std::string read(const fs::path&p){std::ifstream f(p,std::ios::binary);return{std::istreambuf_iterator<char>(f),{}};}
void write(const fs::path&p,const std::string&s){fs::create_directories(p.parent_path());std::ofstream f(p,std::ios::binary);f.write(s.data(),s.size());if(!f)throw std::runtime_error("write failed");}
std::string hex(const std::string&s){std::ostringstream o;o<<std::hex<<std::setfill('0');for(unsigned char c:s)o<<std::setw(2)<<unsigned(c);return o.str();}
std::string deflate(const std::string&s){std::string o;CryptoPP::Deflator c(new CryptoPP::StringSink(o),CryptoPP::Deflator::DEFAULT_DEFLATE_LEVEL,CryptoPP::Deflator::DEFAULT_LOG2_WINDOW_SIZE,true);c.Put2(reinterpret_cast<const CryptoPP::byte*>(s.data()),s.size(),1,true);return o;}
int main(int argc,char**argv){
 if(argc!=3)return 2;const fs::path input=argv[1],out=argv[2];fs::create_directories(out);
 CryptoPP::AutoSeededRandomPool random;std::ostringstream meta;meta<<"[\n";bool first=true;unsigned parts=0;
 for(const auto& e:fs::recursive_directory_iterator(input)){
  if(!e.is_regular_file()||e.path().extension()!=".xml")continue;
  const auto relative=fs::relative(e.path(),input);std::string text=read(e.path());
  if(relative.generic_string()=="styles.xml"){
   const auto original=text;bool found=false;
   for(unsigned n=0;n<2048;++n){text=original+"<!--aligned-fixture-"+std::to_string(n)+std::string(n,'x')+"-->";if(deflate(text).size()%16==0){found=true;break;}}
   if(!found)throw std::runtime_error("aligned fixture search failed");
  }
  CRYPT::_odfCryptData d;d.cipherAlgorithm=CRYPT_METHOD::AES_CBC;d.start_hashAlgorithm=CRYPT_METHOD::SHA256;d.start_hashSize=32;d.checksum_hashAlgorithm=CRYPT_METHOD::SHA256;d.checksum_size=1024;d.keySize=32;d.spinCount=100000;
  d.saltValue.resize(16);d.initializationVector.resize(16);random.GenerateBlock(reinterpret_cast<CryptoPP::byte*>(&d.saltValue[0]),16);random.GenerateBlock(reinterpret_cast<CryptoPP::byte*>(&d.initializationVector[0]),16);
  CRYPT::ODFEncryptor writer;writer.SetCryptData(d);unsigned char* cipher=nullptr;
  const int size=writer.Encrypt(L"synthetic-padding",reinterpret_cast<unsigned char*>(&text[0]),text.size(),cipher);writer.GetCryptData(d);
  if(size<0||!cipher)throw std::runtime_error("fixture encryption failed");
  write(out/(relative.generic_string()+".cipher"),{reinterpret_cast<char*>(cipher),static_cast<size_t>(size)});delete[]cipher;write(out/(relative.generic_string()+".plain"),text);
  if(!first)meta<<",\n";first=false;
  meta<<"{\"path\":\""<<relative.generic_string()<<"\",\"plain_size\":"<<text.size()<<",\"compressed_size\":"<<deflate(text).size()<<",\"cipher_size\":"<<size<<",\"spin\":100000,\"salt\":\""<<hex(d.saltValue)<<"\",\"iv\":\""<<hex(d.initializationVector)<<"\",\"checksum\":\""<<hex(d.checksum)<<"\"}";++parts;
 }
 meta<<"\n]\n";write(out/"metadata.json",meta.str());std::cout<<"synthetic encrypted parts="<<parts<<"\n";return parts==8?0:1;
}
