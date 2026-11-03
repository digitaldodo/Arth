package com.digitaldodo.arth

import android.content.Intent
import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.*
import com.digitaldodo.arth.core.designsystem.ArthTheme
import com.digitaldodo.arth.core.network.EnvironmentValidator
import com.digitaldodo.arth.core.security.AppLockManager
import com.digitaldodo.arth.core.security.BiometricAuthManager
import com.digitaldodo.arth.core.security.SecureStorage
import com.digitaldodo.arth.feature.auth.AuthViewModel
import com.digitaldodo.arth.feature.auth.LoginScreen
import com.digitaldodo.arth.feature.balances.BalancesScreen
import com.digitaldodo.arth.feature.balances.BalancesViewModel
import com.digitaldodo.arth.feature.categories.CategoriesScreen
import com.digitaldodo.arth.feature.categories.CategoriesViewModel
import com.digitaldodo.arth.feature.dashboard.DashboardScreen
import com.digitaldodo.arth.feature.dashboard.DashboardViewModel
import com.digitaldodo.arth.feature.ledger.LedgerScreen
import com.digitaldodo.arth.feature.ledger.LedgerViewModel
import com.digitaldodo.arth.feature.people.PeopleScreen
import com.digitaldodo.arth.feature.people.PeopleViewModel
import com.digitaldodo.arth.feature.people.PersonDetailScreen
import com.digitaldodo.arth.feature.quickadd.QuickAddSheet
import com.digitaldodo.arth.feature.quickadd.QuickAddViewModel
import com.digitaldodo.arth.feature.reports.ReportsScreen
import com.digitaldodo.arth.feature.security.ArthLockScreen
import com.digitaldodo.arth.feature.security.SecuritySettingsScreen
import com.digitaldodo.arth.feature.settings.SettingsScreen
import com.digitaldodo.arth.feature.sms.SmsReviewScreen
import com.digitaldodo.arth.feature.sms.SmsViewModel

sealed class Screen(val route: String, val title: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    object Dashboard : Screen("dashboard", "Dashboard", Icons.Outlined.Home, Icons.Filled.Home)
    object Ledger : Screen("ledger", "Ledger", Icons.Outlined.ReceiptLong, Icons.Filled.ReceiptLong)
    object QuickAdd : Screen("quick_add", "Add", Icons.Outlined.AddCircleOutline, Icons.Filled.AddCircle)
    object Categories : Screen("categories", "Categories", Icons.Outlined.Category, Icons.Filled.Category)
    object More : Screen("more", "More", Icons.Outlined.MoreHoriz, Icons.Filled.MoreHoriz)
}

class MainActivity : FragmentActivity() {
    private val authViewModel: AuthViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()
    private val ledgerViewModel: LedgerViewModel by viewModels()
    private val quickAddViewModel: QuickAddViewModel by viewModels()
    private val categoriesViewModel: CategoriesViewModel by viewModels()
    private val peopleViewModel: PeopleViewModel by viewModels()
    private val balancesViewModel: BalancesViewModel by viewModels()
    private val smsViewModel: SmsViewModel by viewModels()

    private var biometricErrorMessage by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        EnvironmentValidator.validate()
        handleAuthIntent(intent)

        val secureStorage = SecureStorage(this)

        setContent {
            ArthTheme {
                val isLocked by AppLockManager.isLocked.collectAsState()

                if (isLocked && secureStorage.isLoggedIn()) {
                    ArthLockScreen(
                        errorMessage = biometricErrorMessage,
                        onUnlockClicked = { promptBiometricUnlock() },
                        onSignOut = {
                            authViewModel.logout {
                                AppLockManager.unlock()
                            }
                        }
                    )
                } else {
                    ArthAppNavHost(
                        authViewModel = authViewModel,
                        dashboardViewModel = dashboardViewModel,
                        ledgerViewModel = ledgerViewModel,
                        quickAddViewModel = quickAddViewModel,
                        categoriesViewModel = categoriesViewModel,
                        peopleViewModel = peopleViewModel,
                        balancesViewModel = balancesViewModel,
                        smsViewModel = smsViewModel,
                        isLoggedInInitial = secureStorage.isLoggedIn()
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthIntent(intent)
    }

    private fun handleAuthIntent(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme == "arth" && data.host == "auth" && data.path?.startsWith("/callback") == true) {
            var accessToken = data.getQueryParameter("access_token")
            var refreshToken = data.getQueryParameter("refresh_token")
            var userId = data.getQueryParameter("user_id")
            var email = data.getQueryParameter("email")
            val error = data.getQueryParameter("error")
            val errorDescription = data.getQueryParameter("error_description")

            val fragment = data.fragment
            if (accessToken.isNullOrBlank() && !fragment.isNullOrBlank()) {
                val params = fragment.split("&").associate {
                    val parts = it.split("=", limit = 2)
                    if (parts.size == 2) parts[0] to parts[1] else parts[0] to ""
                }
                accessToken = params["access_token"]
                refreshToken = params["refresh_token"]
                userId = params["user_id"]
                email = params["email"]
            }

            if (!error.isNullOrBlank()) {
                authViewModel.onAuthError(errorDescription ?: error)
            } else if (!accessToken.isNullOrBlank()) {
                authViewModel.onSessionReceived(
                    accessToken = accessToken,
                    refreshToken = refreshToken,
                    userId = userId ?: "",
                    email = email
                )
            }
        }
    }

    private fun promptBiometricUnlock() {
        BiometricAuthManager.authenticate(
            activity = this,
            title = "Unlock Arth",
            subtitle = "Authenticate to access your financial information",
            allowDeviceCredential = true,
            onSuccess = {
                AppLockManager.unlock()
                biometricErrorMessage = null
            },
            onError = { errorCode, errString ->
                biometricErrorMessage = when (errorCode) {
                    BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_NEGATIVE_BUTTON ->
                        "Authentication cancelled. Tap Unlock to try again."
                    BiometricPrompt.ERROR_LOCKOUT, BiometricPrompt.ERROR_LOCKOUT_PERMANENT ->
                        "Too many attempts. Please use your device PIN or wait a moment."
                    else -> errString
                }
            },
            onFailed = {
                biometricErrorMessage = "Fingerprint not recognized. Please try again."
            }
        )
    }
}

@Composable
fun ArthAppNavHost(
    authViewModel: AuthViewModel,
    dashboardViewModel: DashboardViewModel,
    ledgerViewModel: LedgerViewModel,
    quickAddViewModel: QuickAddViewModel,
    categoriesViewModel: CategoriesViewModel,
    peopleViewModel: PeopleViewModel,
    balancesViewModel: BalancesViewModel,
    smsViewModel: SmsViewModel,
    isLoggedInInitial: Boolean
) {
    val navController = rememberNavController()
    var showQuickAddSheet by remember { mutableStateOf(false) }

    val authState by authViewModel.uiState.collectAsState()

    LaunchedEffect(authState.isAuthenticated) {
        if (authState.isAuthenticated) {
            navController.navigate("main") {
                popUpTo("login") { inclusive = true }
            }
        }
    }

    val startDestination = if (isLoggedInInitial) "main" else "login"

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable("login") {
            LoginScreen(
                viewModel = authViewModel,
                onLoginSuccess = {
                    navController.navigate("main") {
                        popUpTo("login") { inclusive = true }
                    }
                }
            )
        }

        composable("main") {
            MainTabsScaffold(
                dashboardViewModel = dashboardViewModel,
                ledgerViewModel = ledgerViewModel,
                categoriesViewModel = categoriesViewModel,
                onOpenQuickAdd = { showQuickAddSheet = true },
                onNavigateToBalances = { navController.navigate("balances") },
                onNavigateToPeople = { navController.navigate("people") },
                onNavigateToReports = { navController.navigate("reports") },
                onNavigateToSmsReview = { navController.navigate("sms_review") },
                onNavigateToSecurity = { navController.navigate("security_settings") },
                onSignOut = {
                    authViewModel.logout {
                        navController.navigate("login") {
                            popUpTo("main") { inclusive = true }
                        }
                    }
                }
            )
        }

        composable("balances") {
            BalancesScreen(
                viewModel = balancesViewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable("people") {
            PeopleScreen(
                viewModel = peopleViewModel,
                onPersonClick = { person ->
                    navController.navigate("person_detail/${person.id}")
                }
            )
        }

        composable("person_detail/{personId}") { backStackEntry ->
            val personId = backStackEntry.arguments?.getString("personId")
            val person = peopleViewModel.uiState.collectAsState().value.people.find { it.id == personId }
            if (person != null) {
                PersonDetailScreen(
                    person = person,
                    viewModel = peopleViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
        }

        composable("reports") {
            ReportsScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable("sms_review") {
            SmsReviewScreen(
                viewModel = smsViewModel,
                onBack = { navController.popBackStack() }
            )
        }

        composable("security_settings") {
            SecuritySettingsScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }

    if (showQuickAddSheet) {
        QuickAddSheet(
            viewModel = quickAddViewModel,
            onDismiss = {
                showQuickAddSheet = false
                quickAddViewModel.reset()
                dashboardViewModel.refresh()
            }
        )
    }
}

@Composable
fun MainTabsScaffold(
    dashboardViewModel: DashboardViewModel,
    ledgerViewModel: LedgerViewModel,
    categoriesViewModel: CategoriesViewModel,
    onOpenQuickAdd: () -> Unit,
    onNavigateToBalances: () -> Unit,
    onNavigateToPeople: () -> Unit,
    onNavigateToReports: () -> Unit,
    onNavigateToSmsReview: () -> Unit,
    onNavigateToSecurity: () -> Unit,
    onSignOut: () -> Unit
) {
    val tabNavController = rememberNavController()
    val navBackStackEntry by tabNavController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Screen.Dashboard.route

    // Priority 2: Back navigation from any tab returns to Dashboard
    BackHandler(enabled = currentRoute != Screen.Dashboard.route) {
        tabNavController.navigate(Screen.Dashboard.route) {
            popUpTo(Screen.Dashboard.route) { inclusive = false }
            launchSingleTop = true
        }
    }

    val items = listOf(
        Screen.Dashboard,
        Screen.Ledger,
        Screen.QuickAdd,
        Screen.Categories,
        Screen.More
    )

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp
            ) {
                items.forEach { screen ->
                    val isSelected = currentRoute == screen.route
                    NavigationBarItem(
                        icon = {
                            Icon(
                                imageVector = if (isSelected) screen.selectedIcon else screen.icon,
                                contentDescription = screen.title
                            )
                        },
                        label = { Text(screen.title) },
                        selected = isSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onSurface,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                            unselectedIconColor = ArthTheme.colors.textMuted,
                            unselectedTextColor = ArthTheme.colors.textMuted
                        ),
                        onClick = {
                            if (screen == Screen.QuickAdd) {
                                onOpenQuickAdd()
                            } else {
                                tabNavController.navigate(screen.route) {
                                    popUpTo(tabNavController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        }
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            NavHost(
                navController = tabNavController,
                startDestination = Screen.Dashboard.route
            ) {
                composable(Screen.Dashboard.route) {
                    DashboardScreen(
                        viewModel = dashboardViewModel,
                        onNavigateToLedger = {
                            tabNavController.navigate(Screen.Ledger.route) {
                                launchSingleTop = true
                            }
                        },
                        onNavigateToSmsReview = onNavigateToSmsReview,
                        onTransactionClick = { _ ->
                            tabNavController.navigate(Screen.Ledger.route) {
                                launchSingleTop = true
                            }
                        }
                    )
                }

                composable(Screen.Ledger.route) {
                    LedgerScreen(
                        viewModel = ledgerViewModel,
                        onAddTransactionClick = onOpenQuickAdd
                    )
                }

                composable(Screen.Categories.route) {
                    CategoriesScreen(
                        viewModel = categoriesViewModel
                    )
                }

                composable(Screen.More.route) {
                    SettingsScreen(
                        onNavigateToBalances = onNavigateToBalances,
                        onNavigateToPeople = onNavigateToPeople,
                        onNavigateToReports = onNavigateToReports,
                        onNavigateToSmsReview = onNavigateToSmsReview,
                        onNavigateToSecurity = onNavigateToSecurity,
                        onSignOut = onSignOut
                    )
                }
            }
        }
    }
}
