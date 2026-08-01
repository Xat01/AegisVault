#include <iostream>
#include <string>
#include <filesystem>
#include "FileManager.h"
#include <fstream>
#include <cstdlib>
#include <ctime>
#include  "security.h"
#include "Metadata.h"

namespace fs = std::filesystem;
using namespace std;	

void FileManager::addFile() {
	cout << "Add file selected." << endl;

	string filepath;
	string filename;	

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
		

		fs::copy(filepath, filesPath + "\\" + storedFileName);

		Metadata metadata;
		metadata.saveData(originalFileName, storedFileName);
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

void FileManager::extractFile(){
	
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
		string sourcePath = filesPath+ "\\" + storedfile;
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

void FileManager::listFile() {

	string original;
	string stored;
	int count = 0;

	ifstream files("metadata.txt");

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