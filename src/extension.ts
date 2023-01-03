// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import FileExplorer from './FileExplorer';
import Sync from './Sync';

export function activate(context: vscode.ExtensionContext) {
	FileExplorer.setup(context)
	Sync.setup(context)
}

export function deactivate() { }
