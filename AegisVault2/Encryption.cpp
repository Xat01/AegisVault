#include <iostream>
#include "Encryption.h"
#include <string>
#include <fstream>
#include <vector>

using namespace std;

bool Encryption::encryptFile(const string& inputPath,
    const string& outputPath,
    const string& password)
{
    if (password.empty())
    {
        cout << "Password is empty!\n";
        return false;
    }
    ifstream inputFile(inputPath, ios::binary);

    if (!inputFile)
    {
        cout << "Failed to open input file!\n";
        return false;
    }

    inputFile.seekg(0, ios::end);

    auto fileSize = inputFile.tellg();

    if (fileSize <= 0)
    {
        cout << "File is empty or tellg() failed!\n";
        return false;
    }

    inputFile.seekg(0, ios::beg);

    vector<char> buffer;
    buffer.resize(static_cast<size_t>(fileSize));

    inputFile.read(buffer.data(), fileSize);

    if (!inputFile)
    {
        cout << "Failed while reading file!\n";
        return false;
    }

    inputFile.close();

    
    auto key = generateKey(password);

    
    xorBuffer(buffer, key);

    
    ofstream outputFile(outputPath, ios::binary);

    if (!outputFile)
    {
        cout << "Failed to create output file!\n";
        return false;
    }

    outputFile.write(buffer.data(), fileSize);

    if (!outputFile)
    {
        cout << "Failed while writing file!\n";
        return false;
    }

    outputFile.close();

    cout << "Encryption completed successfully!\n";

    return true;
}

string Encryption::generateKey(const string& password)
{
    string key = "";

    int n = static_cast<int>(password.length()) - 1;

    while (n >= 0)
    {
        key += password[n];
        n--;
    }

    return key;
}

void Encryption::xorBuffer(vector<char>& buffer,
    const string& key)
{
    for (size_t i = 0; i < buffer.size(); i++)
    {
        buffer[i] ^= key[i % key.length()];
    }
}

bool Encryption::decryptFile(const string& inputPath,
    const string& outputPath,
    const string& password) {

    if (password.empty()) {
        cout << "Password is empty\n";
        return false;
    }

    ifstream inputFile(inputPath, ios::binary);
    if (!inputFile) {
        cout << "Failed to open inputfile\n";
        return false;
    }

    inputFile.seekg(0, ios::end);

    auto fileSize = inputFile.tellg();

    if (fileSize <= 0) {
        cout << "fileSize is lesser or tellg() failed\n";
        return false;
    }

    inputFile.seekg(0, ios::beg);

    vector<char> buffer;
    buffer.resize(static_cast<size_t>(fileSize));

    inputFile.read(buffer.data(), fileSize);

    if (!inputFile) {
        cout << "failed to read inputFile\n";
        return false;
    }

    inputFile.close();

    auto key = generateKey(password);

    xorBuffer(buffer, key);

    ofstream outputFile(outputPath, ios::binary);

    if (!outputFile) {
        cout << "Failed to create output file\n";
        return false;
    }
    outputFile.write(buffer.data(), fileSize);

    if (!outputFile) {
        cout << "Failed to write the file\n";
        return false;
    }
    outputFile.close();

    return true;

}