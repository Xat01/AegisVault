#include "Metadata.h"
#include <fstream>
#include <iostream>

using namespace std;

void Metadata::saveData(string originalName, string storedName)
{
    ofstream file("metadata.txt", ios::app);

    if (file.is_open())
    {
        file << originalName << "|" << storedName << endl;
        file.close();
    }
}

string Metadata::findStoredData(string originalName)
{
    ifstream file("metadata.txt");

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
    ifstream file("metadata.txt");
    ofstream temp("temp.txt");

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

    remove("metadata.txt");
    rename("temp.txt", "metadata.txt");
}