/* eslint-disable no-throw-literal */
import * as vscode from 'vscode';
import { API, GitExtension } from './utils/git';
import Config from './utils/config';
import Dialog from './utils/alert';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { Command, RunLoading, Service } from './utils/services';
import { Entry, FM } from './utils/file';

const _exec = promisify(exec);

export default class Sync extends Service {
    gitExtension: GitExtension;

    protected constructor(context: vscode.ExtensionContext) {
        super(context);
        Sync.viewId = 'fileExplorer';
        this.gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git')!.exports;
    }

    private get git(): API {
        return this.gitExtension.getAPI(1);
    }

    private gitRemote() {
        return this.gitRepo()
            .then(re => {
                const remotes = re?.state.remotes.filter(r => r.name === 'origin');
                if (remotes && remotes.length > 0) {return remotes[0];};
                return undefined;
            });
    }

    private gitRepo() {
        return this.git.init(vscode.Uri.file(Config.location));
    }

    // Command
    @Command("mknote.repo.setup")
    async repoSetup() {
        try {

            const repoUri = await Dialog.showInputBox('Git Repo');
            const folder = await Dialog.chooseFolder();

            const location = path.join(folder, 'notes');

            await _exec(`git clone ${repoUri} ${location}`);

            await Config.updateLocation(location);

            vscode.commands.executeCommand('workbench.action.reloadWindow');

        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
        }
    }

    @Command("mknote.repo.sync")
    @RunLoading()
    async repoSync() {
        try {
            // if file
            let gitUri = vscode.Uri.file(`${Config.location}/.git`)
            if (await !FM.exists(gitUri.path)) {
                throw "Please init your folder with git";
            }

            var res = await _exec('git remote', {cwd: Config.location});
            var items = res.stdout.split('\n')
            if (items.length == 0) {
                throw 'Please setup your git-repo with remote';
            }
            var remote = items[0]
            console.log(`remote ${remote}`)

            var res = await _exec('git rev-parse --abbrev-ref HEAD', {cwd: Config.location});
            var items = res.stdout.split('\n')
            var branch = items[0]

            try {
                await _exec(`git add .`, {cwd: Config.location});
                await _exec(`git commit -m '${(new Date()).toLocaleString()}'`, {cwd: Config.location});
                await _exec(`git pull ${remote} ${branch}`, {cwd: Config.location});
                await _exec(`git push ${remote} ${branch}`, {cwd: Config.location});
            } catch {}

            vscode.window.showInformationMessage(`Successfully`);

        } catch (error) {
            vscode.window.showErrorMessage(`${error}`);
        }
    }
}