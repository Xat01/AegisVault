#include <iostream>
#include <string>
#include <filesystem>
#include "FileManager.h"
#include <fstream>
#include <cstdlib>
#include <ctime>
#include "Metadata.h"

namespace fs = std::filesystem;
using namespace std;

void FileManager::addFile() {
	cout << "Add file selected." << endl;

	string filepath;
	string filename;
	string vaultPath = "Vault";

	cout << "Enter file path: ";
	cin >> filepath;
	if (fs::exists(filepath)) {
		if (!fs::exists(vaultPath)) {
			cout << "Vault not initialized\n";
			return;
		}
		string originalFileName = fs::path(filepath).filename().string();

		int randomNumber = rand();
		string storedFileName = to_string(randomNumber) + ".tmp";
		


		fs::copy(filepath, vaultPath + "\\" + storedFileName);

		Metadata metadata;
		metadata.saveData(originalFileName, storedFileName);
	}

}
void FileManager::deleteFile() {
	string vaultPath = "Vault";

	cout << "Delete File Selected" << endl;
	cout << "Enter the file name to delete: ";
	string inputfile;
	cin >> inputfile;
	Metadata metadata;

	string storedFile = metadata.findStoredData(inputfile);

	if (storedFile.empty()) {
		cout << "File not found." << endl;
		return;
	}
	else {
		string fullPath = vaultPath + "\\" + storedFile;
		if (fs::exists(fullPath)) {
			fs::remove(fullPath);
		}
		metadata.deleteData(inputfile);
	}
}

void FileManager::extractFile(){
	string vaultPath = "Vault";
	Metadata metadata;
	cout << "Enter the file to extract: ";
	string extFile;
	cin >> extFile;

	string extFilePath;
	cout << "Where to extract the file:";
	cin >> extFilePath;

	string storedfile = metadata.findStoredData(extFile);

	if (storedfile.empty()) {
		cout << "File not found." << endl;
	}
	else {
		string sourcePath = vaultPath + "\\" + storedfile;
		string destination = extFilePath + "\\" + extFile;

		if (fs::exists(sourcePath)) {
			cout << "Source: " << sourcePath << endl;
			cout << "Destination: " << destination << endl;
			fs::copy(sourcePath, destination);
			cout << "File Extracted Successfully." << endl;
		}
		else {
			cout << "Vault file missing." << endl;
		}
	}
}