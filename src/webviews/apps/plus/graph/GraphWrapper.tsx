import GraphContainer, {
	type CssVariables,
	type GraphColumnSetting as GKGraphColumnSetting,
	type GraphColumnsSettings as GKGraphColumnsSettings,
	type GraphRow,
	type GraphZoneType,
} from '@gitkraken/gitkraken-components';
import type { ReactElement } from 'react';
import React, { createElement, useEffect, useRef, useState } from 'react';
import type { GitGraphRowType } from 'src/git/models/graph';
import type { GraphColumnConfig } from '../../../../config';
import type {
	CommitListCallback,
	GraphCompositeConfig,
	GraphRepository,
	State,
} from '../../../../plus/webviews/graph/protocol';
import type { Subscription } from '../../../../subscription';
import { SubscriptionState } from '../../../../subscription';
import { fromNow } from '../../shared/date';

export interface GraphWrapperProps extends State {
	nonce?: string;
	subscriber: (callback: CommitListCallback) => () => void;
	onSelectRepository?: (repository: GraphRepository) => void;
	onColumnChange?: (name: string, settings: GraphColumnConfig) => void;
	onMoreCommits?: (limit?: number) => void;
	onDismissPreview?: () => void;
	onSelectionChange?: (selection: { id: string; type: GitGraphRowType }[]) => void;
}

const getStyleProps = (
	mixedColumnColors: CssVariables | undefined,
): { cssVariables: CssVariables; themeOpacityFactor: number } => {
	const body = document.body;
	const computedStyle = window.getComputedStyle(body);

	return {
		cssVariables: {
			'--app__bg0': computedStyle.getPropertyValue('--color-background'),
			'--panel__bg0': computedStyle.getPropertyValue('--graph-panel-bg'),
			'--text-selected': computedStyle.getPropertyValue('--color-foreground'),
			'--text-normal': computedStyle.getPropertyValue('--color-foreground--85'),
			'--text-secondary': computedStyle.getPropertyValue('--color-foreground--65'),
			'--text-disabled': computedStyle.getPropertyValue('--color-foreground--50'),
			'--text-accent': computedStyle.getPropertyValue('--color-link-foreground'),
			'--text-inverse': computedStyle.getPropertyValue('--vscode-input-background'),
			'--text-bright': computedStyle.getPropertyValue('--vscode-input-background'),
			...mixedColumnColors,
		},
		themeOpacityFactor: parseInt(computedStyle.getPropertyValue('--graph-theme-opacity-factor')) || 1,
	};
};

const defaultGraphColumnsSettings: GKGraphColumnsSettings = {
	commitAuthorZone: { width: 110 },
	commitDateTimeZone: { width: 130 },
	commitMessageZone: { width: 130 },
	commitZone: { width: 170 },
	refZone: { width: 150 },
};

const getGraphColSettingsModel = (config?: GraphCompositeConfig): GKGraphColumnsSettings => {
	const columnsSettings: GKGraphColumnsSettings = { ...defaultGraphColumnsSettings };
	if (config?.columns !== undefined) {
		for (const column of Object.keys(config.columns)) {
			columnsSettings[column] = {
				width: config.columns[column].width,
			};
		}
	}
	return columnsSettings;
};

type DebouncableFn = (...args: any) => void;
type DebouncedFn = (...args: any) => void;
const debounceFrame = (func: DebouncableFn): DebouncedFn => {
	let timer: number;
	return function (...args: any) {
		if (timer) cancelAnimationFrame(timer);
		timer = requestAnimationFrame(() => {
			func(...args);
		});
	};
};

const createIconElements = (): { [key: string]: ReactElement<any> } => {
	const iconList = [
		'head',
		'remote',
		'tag',
		'stash',
		'check',
		'loading',
		'warning',
		'added',
		'modified',
		'deleted',
		'renamed',
		'resolved',
	];
	const elementLibrary: { [key: string]: ReactElement<any> } = {};
	iconList.forEach(iconKey => {
		elementLibrary[iconKey] = createElement('span', { className: `graph-icon icon--${iconKey}` });
	});
	return elementLibrary;
};

const iconElementLibrary = createIconElements();

const getIconElementLibrary = (iconKey: string) => {
	return iconElementLibrary[iconKey];
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export function GraphWrapper({
	subscriber,
	repositories = [],
	rows = [],
	selectedRepository,
	selectedSha,
	subscription,
	allowed,
	config,
	paging,
	onSelectRepository,
	onColumnChange,
	onMoreCommits,
	onSelectionChange,
	nonce,
	mixedColumnColors,
	previewBanner = true,
	onDismissPreview,
}: GraphWrapperProps) {
	const [graphList, setGraphList] = useState(rows);
	const [reposList, setReposList] = useState(repositories);
	const [currentRepository, setCurrentRepository] = useState<GraphRepository | undefined>(
		reposList.find(item => item.path === selectedRepository),
	);
	const [currentSha, setSelectedSha] = useState(selectedSha);
	const [graphColSettings, setGraphColSettings] = useState(getGraphColSettingsModel(config));
	const [pagingState, setPagingState] = useState(paging);
	const [isLoading, setIsLoading] = useState(false);
	const [styleProps, setStyleProps] = useState(getStyleProps(mixedColumnColors));
	// TODO: application shouldn't know about the graph component's header
	const graphHeaderOffset = 24;
	const [mainWidth, setMainWidth] = useState<number>();
	const [mainHeight, setMainHeight] = useState<number>();
	const mainRef = useRef<HTMLElement>(null);
	// banner
	const [showPreview, setShowPreview] = useState(previewBanner);
	// account
	const [showAccount, setShowAccount] = useState(true);
	const [isAllowed, setIsAllowed] = useState(allowed ?? false);
	const [subscriptionSnapshot, setSubscriptionSnapshot] = useState<Subscription | undefined>(subscription);
	// repo selection UI
	const [repoExpanded, setRepoExpanded] = useState(false);

	useEffect(() => {
		if (mainRef.current === null) {
			return;
		}

		const setDimensionsDebounced = debounceFrame((width, height) => {
			setMainWidth(Math.floor(width));
			setMainHeight(Math.floor(height) - graphHeaderOffset);
		});

		const resizeObserver = new ResizeObserver(entries => {
			entries.forEach(entry => {
				setDimensionsDebounced(entry.contentRect.width, entry.contentRect.height);
			});
		});
		resizeObserver.observe(mainRef.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, [mainRef]);

	function transformData(state: State) {
		setGraphList(state.rows ?? []);
		setReposList(state.repositories ?? []);
		setCurrentRepository(reposList.find(item => item.path === state.selectedRepository));
		setSelectedSha(state.selectedSha);
		setGraphColSettings(getGraphColSettingsModel(state.config));
		setPagingState(state.paging);
		setIsLoading(false);
		setStyleProps(getStyleProps(state.mixedColumnColors));
		setIsAllowed(state.allowed ?? false);
		setSubscriptionSnapshot(state.subscription);
	}

	useEffect(() => {
		if (subscriber === undefined) {
			return;
		}
		return subscriber(transformData);
	}, []);

	const handleSelectRepository = (item: GraphRepository) => {
		if (item != null && item !== currentRepository) {
			onSelectRepository?.(item);
		}
		setRepoExpanded(false);
	};

	const handleToggleRepos = () => {
		if (currentRepository != null && reposList.length <= 1) return;
		setRepoExpanded(!repoExpanded);
	};

	const handleMoreCommits = () => {
		setIsLoading(true);
		onMoreCommits?.();
	};

	const handleOnColumnResized = (graphZoneType: GraphZoneType, columnSettings: GKGraphColumnSetting) => {
		onColumnChange?.(graphZoneType, { width: columnSettings.width });
	};

	const handleSelectGraphRows = (graphRows: GraphRow[]) => {
		onSelectionChange?.(graphRows.map(r => ({ id: r.sha, type: r.type as GitGraphRowType })));
	};

	const handleDismissPreview = () => {
		setShowPreview(false);
		onDismissPreview?.();
	};

	const handleDismissAccount = () => {
		setShowAccount(false);
	};

	const renderAlertContent = () => {
		if (subscriptionSnapshot == null) return;

		let icon = 'account';
		let modifier = '';
		let content;
		let actions;
		switch (subscriptionSnapshot.state) {
			case SubscriptionState.Free:
			case SubscriptionState.Paid:
				return;
			case SubscriptionState.FreeInPreview:
				icon = 'calendar';
				modifier = 'neutral';
				content = (
					<>
						<p className="alert__title">Trial Preview</p>
						<p className="alert__message">
							You're able to view the Commit Graph with any repository until your preview expires
							{subscriptionSnapshot.previewTrial
								? ` ${fromNow(new Date(subscriptionSnapshot.previewTrial.expiresOn))}`
								: ''}
							.
						</p>
					</>
				);
				break;
			case SubscriptionState.FreePreviewExpired:
				icon = 'warning';
				modifier = 'warning';
				content = (
					<>
						<p className="alert__title">Extend Your Trial</p>
						<p className="alert__message">Sign in to extend your free trial an additional 7-days.</p>
					</>
				);
				actions = (
					<>
						<a className="alert-action" href="command:gitlens.plus.loginOrSignUp">
							Try for 7-days
						</a>{' '}
						<a className="alert-action" href="command:gitlens.plus.purchase">
							View Plans
						</a>
					</>
				);
				break;
			case SubscriptionState.FreePlusInTrial:
				icon = 'calendar';
				modifier = 'neutral';
				content = (
					<>
						<p className="alert__title">Extended Trial</p>
						<p className="alert__message">
							You're able to view the Commit Graph with any repository until your trial expires
							{subscriptionSnapshot.previewTrial
								? ` ${fromNow(new Date(subscriptionSnapshot.previewTrial.expiresOn))}`
								: ''}
							.
						</p>
					</>
				);
				break;
			case SubscriptionState.FreePlusTrialExpired:
				icon = 'warning';
				modifier = 'warning';
				content = (
					<>
						<p className="alert__title">Trial Expired</p>
						<p className="alert__message">
							Upgrade your account to use the Commit Graph and other GitLens+ features on private repos.
						</p>
						<p>
							<a className="alert-action" href="command:gitlens.plus.purchase">
								Upgrade Your Account
							</a>
						</p>
					</>
				);
				break;
			case SubscriptionState.VerificationRequired:
				icon = 'unverified';
				modifier = 'warning';
				content = (
					<>
						<p className="alert__title">Please verify your email</p>
						<p className="alert__message">Please verify the email for the account you created.</p>
					</>
				);
				actions = (
					<>
						<a className="alert-action" href="command:gitlens.plus.resendVerification">
							Resend Verification Email
						</a>
						<a className="alert-action" href="command:gitlens.plus.validate">
							Refresh Verification Status
						</a>
					</>
				);
				break;
		}

		return (
			<div className={`alert${modifier !== '' ? ` alert--${modifier}` : ''}`}>
				<span className={`alert__icon codicon codicon-${icon}`}></span>
				<div className="alert__content">{content}</div>
				{actions && <div className="alert__actions">{actions}</div>}
				{isAllowed && (
					<button className="alert__dismiss" type="button" onClick={() => handleDismissAccount()}>
						<span className="codicon codicon-chrome-close"></span>
					</button>
				)}
			</div>
		);
	};

	return (
		<>
			<section className="graph-app__banners">
				{showPreview && (
					<div className="alert">
						<span className="alert__icon codicon codicon-eye"></span>
						<div className="alert__content">
							<p className="alert__title">GitLens+ Feature Preview</p>
							<p className="alert__message">
								The Commit Graph is freely available for local and public repos, while private repos
								require a paid plan. While this preview isn't yet fully featured, we are quickly working
								on the next release, when it will exit preview.
							</p>
							<p className="alert__accent">
								<span className="glicon glicon-clock alert__accent-icon" /> GitLens+ introductory
								pricing will end with the next release (late Sept, early Oct).
							</p>
							<p className="alert__accent">
								<span className="codicon codicon-feedback alert__accent-icon" /> Join the discussions on
								GitHub! We'd love to hear from you.
							</p>
						</div>
						<div className="alert__actions">
							<a className="alert-action" href="command:gitlens.plus.purchase">
								Get GitLens+
							</a>
							<a
								className="alert-action"
								href="https://github.com/gitkraken/vscode-gitlens/discussions/2158"
							>
								Give Feedback
							</a>
						</div>
						<button className="alert__dismiss" type="button" onClick={() => handleDismissPreview()}>
							<span className="codicon codicon-chrome-close"></span>
						</button>
					</div>
				)}
				{showAccount && renderAlertContent()}
			</section>
			<main
				ref={mainRef}
				id="main"
				className={`graph-app__main${!isAllowed ? ' is-gated' : ''}`}
				aria-hidden={!isAllowed}
			>
				{!isAllowed && <div className="graph-app__cover"></div>}
				{currentRepository !== undefined ? (
					<>
						{mainWidth !== undefined && mainHeight !== undefined && (
							<GraphContainer
								columnsSettings={graphColSettings}
								cssVariables={styleProps.cssVariables}
								// eslint-disable-next-line @typescript-eslint/ban-ts-comment
								//@ts-ignore - remove once the Graph component is updated to use the new API
								getExternalIcon={getIconElementLibrary}
								graphRows={graphList}
								height={mainHeight}
								isSelectedBySha={currentSha ? { [currentSha]: true } : undefined}
								hasMoreCommits={pagingState?.more}
								isLoadingRows={isLoading}
								nonce={nonce}
								onColumnResized={handleOnColumnResized}
								onSelectGraphRows={handleSelectGraphRows}
								onShowMoreCommits={handleMoreCommits}
								width={mainWidth}
								themeOpacityFactor={styleProps.themeOpacityFactor}
							/>
						)}
					</>
				) : (
					<p>No repository is selected</p>
				)}
			</main>
			<footer className={`actionbar graph-app__footer${!isAllowed ? ' is-gated' : ''}`} aria-hidden={!isAllowed}>
				<div className="actionbar__group">
					<div className="actioncombo">
						<button
							type="button"
							aria-controls="repo-actioncombo-list"
							aria-expanded={repoExpanded}
							aria-haspopup="listbox"
							id="repo-actioncombo-label"
							className="actioncombo__label"
							role="combobox"
							aria-activedescendant={
								repoExpanded
									? `repo-actioncombo-item-${reposList.findIndex(
											item => item.path === currentRepository?.path,
									  )}`
									: undefined
							}
							onClick={() => handleToggleRepos()}
						>
							<span className="codicon codicon-repo actioncombo__icon" aria-label="Repository "></span>
							{currentRepository?.formattedName ?? 'none selected'}
						</button>
						<div
							className="actioncombo__list"
							id="repo-actioncombo-list"
							role="listbox"
							tabIndex={-1}
							aria-labelledby="repo-actioncombo-label"
						>
							{reposList.length > 0 ? (
								reposList.map((item, index) => (
									<button
										type="button"
										className="actioncombo__item"
										role="option"
										data-value={item.path}
										id={`repo-actioncombo-item-${index}`}
										key={`repo-actioncombo-item-${index}`}
										aria-selected={item.path === currentRepository?.path}
										onClick={() => handleSelectRepository(item)}
										disabled={item.path === currentRepository?.path}
									>
										{item.formattedName}
									</button>
								))
							) : (
								<span
									className="actioncombo__item"
									role="option"
									id="repo-actioncombo-item-0"
									aria-selected="true"
								>
									None available
								</span>
							)}
						</div>
					</div>
					{isAllowed && graphList.length > 0 && (
						<span className="actionbar__details">
							showing {graphList.length} item{graphList.length ? 's' : ''}
						</span>
					)}
					{isLoading && <span className="actionbar__loading icon--loading icon-modifier--spin" />}
				</div>
				<div className="actionbar__group">
					<span className="badge">Preview</span>
					<a
						href="https://github.com/gitkraken/vscode-gitlens/discussions/2158"
						title="Commit Graph Feedback"
						aria-label="Commit Graph Feedback"
					>
						<span className="codicon codicon-feedback"></span>
					</a>
				</div>
			</footer>
		</>
	);
}
