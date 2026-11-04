package com.digitaldodo.arth

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.automirrored.outlined.ReceiptLong
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
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
import kotlinx.coroutines.launch

sealed class Screen(val route: String, val title: String, val icon: ImageVector, val selectedIcon: ImageVector) {
    object Dashboard : Screen("dashboard", "Dashboard", Icons.Outlined.Home, Icons.Filled.Home)
    object Ledger : Screen("ledger", "Ledger", Icons.AutoMirrored.Outlined.ReceiptLong, Icons.AutoMirrored.Filled.ReceiptLong)
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
        if (secureStorage.isLoggedIn()) {
            lifecycleScope.launch {
                com.digitaldodo.arth.core.sync.AccountSyncService.getInstance(this@MainActivity).syncAll()
            }
        }

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
                peopleViewModel = peopleViewModel,
                balancesViewModel = balancesViewModel,
                smsViewModel = smsViewModel,
                onOpenQuickAdd = { showQuickAddSheet = true },
                onSignOut = {
                    authViewModel.logout {
                        navController.navigate("login") {
                            popUpTo("main") { inclusive = true }
                        }
                    }
                }
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
                ledgerViewModel.refresh()
            }
        )
    }
}

@Composable
fun MainTabsScaffold(
    dashboardViewModel: DashboardViewModel,
    ledgerViewModel: LedgerViewModel,
    categoriesViewModel: CategoriesViewModel,
    peopleViewModel: PeopleViewModel,
    balancesViewModel: BalancesViewModel,
    smsViewModel: SmsViewModel,
    onOpenQuickAdd: () -> Unit,
    onSignOut: () -> Unit
) {
    val tabNavController = rememberNavController()
    val navBackStackEntry by tabNavController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Screen.Dashboard.route

    val isSubScreen = currentRoute in listOf("balances", "people", "reports", "sms_review", "security_settings")
    val isPersonDetail = currentRoute.startsWith("person_detail")

    // Priority 1: Back from person detail returns to people
    BackHandler(enabled = isPersonDetail) {
        tabNavController.popBackStack()
    }

    // Priority 2: Back from sub-screens returns to More hub
    BackHandler(enabled = isSubScreen) {
        tabNavController.navigate(Screen.More.route) {
            popUpTo(Screen.Dashboard.route) { inclusive = false }
            launchSingleTop = true
        }
    }

    // Priority 3: Back from other top-level tabs returns to Dashboard
    val isOtherTab = currentRoute in listOf(Screen.Ledger.route, Screen.Categories.route, Screen.More.route)
    BackHandler(enabled = isOtherTab) {
        tabNavController.navigate(Screen.Dashboard.route) {
            popUpTo(Screen.Dashboard.route) { inclusive = false }
            launchSingleTop = true
        }
    }

    // Priority 4: From Dashboard, double-back exits
    val isDashboard = currentRoute == Screen.Dashboard.route
    var lastBackPressedTime by remember { mutableLongStateOf(0L) }
    val context = LocalContext.current
    val activity = context as? Activity

    BackHandler(enabled = isDashboard) {
        val now = System.currentTimeMillis()
        if (now - lastBackPressedTime < 2000L) {
            activity?.finish()
        } else {
            lastBackPressedTime = now
            Toast.makeText(context, "Press back again to exit Arth", Toast.LENGTH_SHORT).show()
        }
    }

    Scaffold(
        bottomBar = {
            if (!isPersonDetail) {
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.surface,
                    tonalElevation = 0.dp,
                    modifier = Modifier.border(BorderStroke(1.dp, ArthTheme.colors.border))
                ) {
                    // 1. Dashboard Tab
                    val isDashboardSelected = currentRoute == Screen.Dashboard.route
                    NavigationBarItem(
                        icon = {
                            Icon(
                                imageVector = if (isDashboardSelected) Screen.Dashboard.selectedIcon else Screen.Dashboard.icon,
                                contentDescription = Screen.Dashboard.title
                            )
                        },
                        label = { Text(Screen.Dashboard.title) },
                        selected = isDashboardSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onSurface,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                            unselectedIconColor = ArthTheme.colors.textMuted,
                            unselectedTextColor = ArthTheme.colors.textMuted
                        ),
                        onClick = {
                            tabNavController.navigate(Screen.Dashboard.route) {
                                popUpTo(Screen.Dashboard.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )

                    // 2. Ledger Tab
                    val isLedgerSelected = currentRoute == Screen.Ledger.route
                    NavigationBarItem(
                        icon = {
                            Icon(
                                imageVector = if (isLedgerSelected) Screen.Ledger.selectedIcon else Screen.Ledger.icon,
                                contentDescription = Screen.Ledger.title
                            )
                        },
                        label = { Text(Screen.Ledger.title) },
                        selected = isLedgerSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onSurface,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                            unselectedIconColor = ArthTheme.colors.textMuted,
                            unselectedTextColor = ArthTheme.colors.textMuted
                        ),
                        onClick = {
                            tabNavController.navigate(Screen.Ledger.route) {
                                popUpTo(Screen.Dashboard.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )

                    // 3. Central Floating Quick Add Action (+)
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight(),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(44.dp)
                                .clip(CircleShape)
                                .background(MaterialTheme.colorScheme.primary)
                                .border(BorderStroke(2.dp, MaterialTheme.colorScheme.surface), CircleShape)
                                .clickable { onOpenQuickAdd() },
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Add,
                                contentDescription = "Add Transaction",
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    // 4. Categories Tab
                    val isCategoriesSelected = currentRoute == Screen.Categories.route
                    NavigationBarItem(
                        icon = {
                            Icon(
                                imageVector = if (isCategoriesSelected) Screen.Categories.selectedIcon else Screen.Categories.icon,
                                contentDescription = Screen.Categories.title
                            )
                        },
                        label = { Text(Screen.Categories.title) },
                        selected = isCategoriesSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onSurface,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                            unselectedIconColor = ArthTheme.colors.textMuted,
                            unselectedTextColor = ArthTheme.colors.textMuted
                        ),
                        onClick = {
                            tabNavController.navigate(Screen.Categories.route) {
                                popUpTo(Screen.Dashboard.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )

                    // 5. More Tab
                    val isMoreSelected = currentRoute == Screen.More.route || isSubScreen
                    NavigationBarItem(
                        icon = {
                            Icon(
                                imageVector = if (isMoreSelected) Screen.More.selectedIcon else Screen.More.icon,
                                contentDescription = Screen.More.title
                            )
                        },
                        label = { Text(Screen.More.title) },
                        selected = isMoreSelected,
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.onSurface,
                            selectedTextColor = MaterialTheme.colorScheme.onSurface,
                            indicatorColor = MaterialTheme.colorScheme.surfaceVariant,
                            unselectedIconColor = ArthTheme.colors.textMuted,
                            unselectedTextColor = ArthTheme.colors.textMuted
                        ),
                        onClick = {
                            tabNavController.navigate(Screen.More.route) {
                                popUpTo(Screen.Dashboard.route) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
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
                        onNavigateToSmsReview = {
                            tabNavController.navigate("sms_review") {
                                launchSingleTop = true
                            }
                        },
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
                        onNavigateToBalances = { tabNavController.navigate("balances") },
                        onNavigateToPeople = { tabNavController.navigate("people") },
                        onNavigateToReports = { tabNavController.navigate("reports") },
                        onNavigateToSmsReview = { tabNavController.navigate("sms_review") },
                        onNavigateToSecurity = { tabNavController.navigate("security_settings") },
                        onSignOut = onSignOut
                    )
                }

                composable("balances") {
                    BalancesScreen(
                        viewModel = balancesViewModel,
                        onBack = { tabNavController.popBackStack() }
                    )
                }

                composable("people") {
                    PeopleScreen(
                        viewModel = peopleViewModel,
                        onPersonClick = { person ->
                            tabNavController.navigate("person_detail/${person.id}")
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
                            onBack = { tabNavController.popBackStack() }
                        )
                    }
                }

                composable("reports") {
                    ReportsScreen(
                        onBack = { tabNavController.popBackStack() }
                    )
                }

                composable("sms_review") {
                    SmsReviewScreen(
                        viewModel = smsViewModel,
                        onBack = { tabNavController.popBackStack() }
                    )
                }

                composable("security_settings") {
                    SecuritySettingsScreen(
                        onBack = { tabNavController.popBackStack() }
                    )
                }
            }
        }
    }
}
