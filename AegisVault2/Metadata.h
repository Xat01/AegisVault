#pragma once
#include <string>
using namespace std;


class Metadata {
private:
public:
	void saveData(string originalName, string storedName);

	string findStoredData(string originalName);

	void deleteData(string originalName);


};