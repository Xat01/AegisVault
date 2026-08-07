#include "Metadata.h"
#include <fstream>
#include <iostream>
#include <openssl/sha.h>
#include <iomanip>
#include <sstream>
#include <filesystem>
namespace fs = filesystem;
using namespace std;

void Metadata::saveData(string originalName, string storedName)
{
    ofstream file(vaultPath + "/metadata.dat", ios::app);

    if (file.is_open())
    {
        file << originalName << "|" << storedName << endl;
        file.close();
    }
    Metadata::updateMetadataSignature();
}

string Metadata::findStoredData(string originalName)
{
    ifstream file(vaultPath + "/metadata.dat");

    string original;
    string stored;

    while (getline(file, original, '|') && getline(file, stored))
    {
        if (original == originalName)
        {
            file.close();
            return stored;
        }
    }

    file.close();
    return "";
}

void Metadata::deleteData(string originalName)
{
    ifstream file(vaultPath + "/metadata.dat");
    ofstream temp(vaultPath + "/temp.txt");

    string original;
    string stored;

    while (getline(file, original, '|') && getline(file, stored))
    {
        if (original != originalName)
        {
            temp << original << "|" << stored << endl;
        }
    }

    file.close();
    temp.close();

    remove((vaultPath + "/metadata.dat").c_str());
    rename((vaultPath + "/temp.txt").c_str(), (vaultPath + "/metadata.dat").c_str());

    Metadata::updateMetadataSignature();
}

string Metadata::calculateMetadataHash() {
    ifstream metadataFile(vaultPath + "/metadata.dat", ios::in);
    
    if (!metadataFile) {
        cout << "Metadata file cannot be opened!\n";
        return "Error.";
    }

    stringstream buffer;

    buffer << metadataFile.rdbuf();

    string metadataContents = buffer.str();

    unsigned char hash[SHA256_DIGEST_LENGTH];
    SHA256(reinterpret_cast<const unsigned char*>(metadataContents.c_str()),
        metadataContents.size(),
        hash);

    ostringstream ss;
    for (unsigned char byte : hash) {
        ss << hex;
        ss << setfill('0') << setw(2);
        ss << static_cast<int>(byte);
    }
    return ss.str();
}

bool Metadata::verifyMetadataIntegrity() {
    if (!fs::exists(signaturePath)) {
        ofstream outFile(signaturePath);
        string currentHash = calculateMetadataHash();

        outFile << currentHash;
        outFile.close();
        return true;
    }
    ifstream inFile(signaturePath);
    string reCalcHash = calculateMetadataHash();
    string storedHash;
    getline(inFile, storedHash);
    if (reCalcHash== storedHash) {
        return true;
    }
    else {
        return false;
    }
    return true;
}

void Metadata::updateMetadataSignature() {

    string callMetaHash = calculateMetadataHash();

    ofstream outFile(signaturePath);

    outFile << callMetaHash;

    outFile.close();
}