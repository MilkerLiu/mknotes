import * as vscode from 'vscode';

export default class Config {
    static get location(): string {
        return vscode.workspace.getConfiguration('mknote').get('location') ?? "";
    }
    static updateLocation(location: string) {
        return new Promise((resolve, reject) => {
            vscode.workspace.getConfiguration('mknote').update('location', location, true)
                .then(() => resolve(location));
        });
    }
}
