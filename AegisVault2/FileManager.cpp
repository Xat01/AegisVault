#include <iostream>
#include <string>
#include <filesystem>
#include "FileManager.h"
#include <fstream>
#include <cstdlib>
#include <ctime>
#include  "security.h"
#include "Encryption.h"
#include "Metadata.h"

namespace fs = std::filesystem;
using namespace std;	

void FileManager::addFile() {
	cout << "Add file selected." << endl;

	string filepath;
	string filename;	
	string password;

	cout << "Enter file path: ";
	cin >> filepath;
	filepath = FileManager::cleanPath(filepath);
	if (fs::exists(filepath)) {
		if (!fs::exists(vaultPath)) {
			cout << "Vault not initialized\n";
			return;
		}
		string originalFileName = fs::path(filepath).filename().string();

		int randomNumber = rand();
		string storedFileName = to_string(randomNumber) + ".tmp";
		
		cout << "Enter encryption password: ";
		cin >> password;

		string outputPath = filesPath + "\\" + storedFileName;
		Encryption encryption;

		bool success = encryption.encryptFile(filepath,outputPath,password);


		if (success) {
			Metadata metadata;
			metadata.saveData(originalFileName, storedFileName);
		}
		else {
			cout << "Metadata cannto be saved \n";
		}
	}

}
void FileManager::deleteFile() {


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
		string fullPath = filesPath+ "\\" + storedFile;
		if (fs::exists(fullPath)) {
			fs::remove(fullPath);
		}
		metadata.deleteData(inputfile);
	}
}

void FileManager::extractFile() {

	Metadata metadata;
	cout << "Enter the file to extract: ";
	string extFile;
	cin >> extFile;

	string extFilePath;
	cout << "Where to extract the file:";
	cin >> extFilePath;
	extFilePath = FileManager::cleanPath(extFilePath);

	string storedfile = metadata.findStoredData(extFile);

	if (storedfile.empty()) {
		cout << "File not found." << endl;
	}
	else {
		string sourcePath = filesPath + "\\" + storedfile;
		string destination = extFilePath + "\\" + extFile;
		string password;
		cout << "Enter encryption password: ";
		cin >> password;

		Encryption encryption;
		if (fs::exists(sourcePath)) {
			cout << "Source: " << sourcePath << endl;
			cout << "Destination: " << destination << endl;

			bool success = encryption.decryptFile(sourcePath, destination, password);
			if (!success) {
				cout << "Extraction failed!\n";
				return;
			}
			else {
				cout << "Extraction Successful!\n";
				return;
			}
		}
		else {
			cout << "Vault file missing." << endl;
		}
	}
}

string FileManager::cleanPath(const string& path) {
	if (path.empty()) {
		cout << "Path cannot be empty!\n";
		return path;
	}
	string cleaned = path;

	if (cleaned.front() == '"') {
		cleaned.erase(0, 1);
	}
	if (!cleaned.empty() && cleaned.back() == '"') {
		cleaned.erase(cleaned.length() - 1, 1);
	}
	return cleaned;

	
}

void FileManager::listFile() {

	string original;
	string stored;
	int count = 0;

	ifstream files(vaultPath + "/metadata.txt");

	if (!files) {

		for (int i = 0;i < 3;i++) {
			cout << "ERROR-> Metadata.txt file cannot be opened!\n";
		}
		return;
	}

	while (getline(files, original, '|') && getline(files, stored)) {
		cout << original << endl;
		count++;
	}
	cout << "Total Count: " << count;
	
	



}