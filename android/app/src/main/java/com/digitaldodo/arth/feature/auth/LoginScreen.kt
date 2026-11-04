package com.digitaldodo.arth.feature.auth

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.digitaldodo.arth.core.designsystem.ArthButton
import com.digitaldodo.arth.core.designsystem.ArthOutlinedButton
import com.digitaldodo.arth.core.designsystem.ArthTheme

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoginSuccess: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current
    val context = LocalContext.current
    val activity = context as? Activity

    LaunchedEffect(state.isAuthenticated) {
        if (state.isAuthenticated) {
            onLoginSuccess()
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .padding(vertical = 32.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "Arth",
                style = MaterialTheme.typography.displayMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Personal Financial Ledger",
                style = MaterialTheme.typography.titleMedium,
                color = ArthTheme.colors.textSecondary
            )

            Spacer(Modifier.height(36.dp))

            // Native Google Sign-In Button (Credential Manager)
            ArthButton(
                text = "Sign in with Google",
                onClick = {
                    if (activity != null) {
                        viewModel.signInWithNativeGoogle(activity, onLoginSuccess)
                    } else {
                        viewModel.startBrowserGoogleSignIn(context)
                    }
                },
                isLoading = state.isLoading,
                modifier = Modifier.fillMaxWidth(),
                backgroundColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )

            Spacer(Modifier.height(20.dp))

            // Divider
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                HorizontalDivider(
                    modifier = Modifier.weight(1f),
                    color = ArthTheme.colors.border
                )
                Text(
                    text = "  or sign in with email  ",
                    style = MaterialTheme.typography.labelSmall,
                    color = ArthTheme.colors.textMuted
                )
                HorizontalDivider(
                    modifier = Modifier.weight(1f),
                    color = ArthTheme.colors.border
                )
            }

            Spacer(Modifier.height(20.dp))

            OutlinedTextField(
                value = state.email,
                onValueChange = { viewModel.onEmailChanged(it) },
                label = { Text("Email Address") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Email,
                    imeAction = ImeAction.Next
                ),
                keyboardActions = KeyboardActions(
                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                )
            )

            Spacer(Modifier.height(14.dp))

            OutlinedTextField(
                value = state.password,
                onValueChange = { viewModel.onPasswordChanged(it) },
                label = { Text("Password") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Done
                ),
                keyboardActions = KeyboardActions(
                    onDone = {
                        focusManager.clearFocus()
                        viewModel.login(onLoginSuccess)
                    }
                )
            )

            if (state.errorMessage != null) {
                Spacer(Modifier.height(14.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(ArthTheme.colors.crimsonContainer)
                        .border(1.dp, ArthTheme.colors.crimson.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = "Error",
                                tint = ArthTheme.colors.crimson,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = state.errorMessage ?: "",
                                color = ArthTheme.colors.crimson,
                                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                                modifier = Modifier.weight(1f)
                            )
                        }

                        // Browser fallback link if native credential sign-in fails
                        Text(
                            text = "Trouble signing in? Open in browser →",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = ArthTheme.colors.crimson,
                            modifier = Modifier
                                .clickable { viewModel.startBrowserGoogleSignIn(context) }
                                .padding(top = 4.dp)
                        )
                    }
                }
            }

            Spacer(Modifier.height(24.dp))

            ArthOutlinedButton(
                text = "Sign In with Password",
                onClick = {
                    focusManager.clearFocus()
                    viewModel.login(onLoginSuccess)
                },
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(Modifier.height(12.dp))

            ArthOutlinedButton(
                text = "Continue Offline",
                onClick = { viewModel.continueOffline(onLoginSuccess) },
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
