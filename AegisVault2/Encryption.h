#pragma once
#include <string>
#include <vector>

class Encryption {
public:
	bool encryptFile(const std::string& inputPath,const std::string& outputPath,const std::string& password);
	bool decryptFile(const std::string& inputPath, const std::string& ouptputPath, const std::string& password);

private:
	std::string generateKey(const std::string& password);

	void xorBuffer(std::vector<char>& buffer, const std::string& key);

};