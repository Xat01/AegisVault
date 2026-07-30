#include "Menu.h"
#include <ctime>
#include <cstdlib>
#include "Security.h"
#include <iostream>

int main() {

	Security sec;
	if (sec.login()) {
		Menu menu;
		menu.showMenu();
	}

	return 0;
}