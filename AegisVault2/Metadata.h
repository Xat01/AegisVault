#pragma once
#include <string>
using namespace std;


class Metadata {
private:
public:
	void saveData(string originalName, string storedName);
	bool verifyMetadataIntegrity();
	string findStoredData(string originalName);
	string calculateMetadataHash();
	void updateMetadataSignature();
	void deleteData(string originalName);
	const std::string vaultPath = "Vault";
	const std::string signaturePath = vaultPath + "/metadata.sig";


};